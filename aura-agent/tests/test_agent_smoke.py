"""Smoke tests for AuraAgent's tool loop and confirmation flow. All externals mocked."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from aura import agent as agent_module
from aura import voice as voice_module
from aura.agent import AuraAgent, TextAgent


def _mock_fleet() -> MagicMock:
    fleet = MagicMock()
    fleet.trigger_compliance_log = AsyncMock(return_value="TX_LOG")
    fleet.trigger_inference_payment = AsyncMock(return_value="TX_PAY")
    fleet.get_fleet_status = AsyncMock(
        return_value={
            "robots": [
                {"id": "robot_01", "name": "Aura-Panda-01", "grade": "A", "status": "healthy"},
                {"id": "robot_02", "name": "Aura-Panda-02", "grade": "C", "status": "anomaly"},
                {"id": "robot_03", "name": "Aura-Panda-03", "grade": "B", "status": "idle"},
            ]
        }
    )
    fleet.pause_robot = AsyncMock(return_value=None)
    return fleet


def _llm_message(*, content: str | None = None, tool_calls: list[dict] | None = None) -> MagicMock:
    msg = MagicMock()
    msg.content = content
    if tool_calls:
        tcs = []
        for tc in tool_calls:
            obj = MagicMock()
            obj.id = tc["id"]
            obj.function = MagicMock(name=tc["name"], arguments=tc["arguments"])
            obj.function.name = tc["name"]
            obj.function.arguments = tc["arguments"]
            tcs.append(obj)
        msg.tool_calls = tcs
    else:
        msg.tool_calls = []
    return msg


def _llm_response(message: MagicMock) -> MagicMock:
    resp = MagicMock()
    resp.choices = [MagicMock(message=message)]
    return resp


@pytest.fixture
def mute_audio(monkeypatch):
    """Stub out every audio + transcription call so turn() runs in-process."""
    async def fake_record(max_s=30.0):
        return b"WAVE"

    async def fake_transcribe(wav, client):
        return monkeypatch._utterance

    async def fake_tts(text, voice_id, client):
        if False:
            yield b""
        return

    speaker = MagicMock()
    speaker.write = MagicMock()
    speaker.stop = MagicMock()
    speaker.close = MagicMock()

    monkeypatch._utterance = "what is the fleet status"
    monkeypatch.setattr(voice_module, "_record_until_silence", fake_record)
    monkeypatch.setattr(voice_module, "_transcribe_whisper", fake_transcribe)
    monkeypatch.setattr(voice_module, "_stream_tts", fake_tts)
    monkeypatch.setattr(voice_module, "_open_speaker", lambda: speaker)
    monkeypatch.setattr(agent_module, "_record_until_silence", fake_record)
    monkeypatch.setattr(agent_module, "_transcribe_whisper", fake_transcribe)
    monkeypatch.setattr(agent_module, "_stream_tts", fake_tts)
    monkeypatch.setattr(agent_module, "_open_speaker", lambda: speaker)
    monkeypatch.setattr(agent_module, "AsyncElevenLabs", lambda **_: MagicMock())
    return monkeypatch


@pytest.fixture
def fake_openai(monkeypatch):
    """Returns a closure to seed the queue of LLM responses."""

    queue: list[MagicMock] = []

    fake_client = MagicMock()
    fake_client.chat.completions.create = AsyncMock(side_effect=lambda **_: queue.pop(0))

    monkeypatch.setattr(agent_module, "AsyncOpenAI", lambda **_: fake_client)

    def seed(*responses):
        queue.extend(responses)

    return seed


def test_classify_yes_no_regex_yes() -> None:
    assert AuraAgent._classify_yes_no_regex("yeah go for it") == "yes"
    assert AuraAgent._classify_yes_no_regex("Yes please proceed") == "yes"
    assert AuraAgent._classify_yes_no_regex("Sure, do it") == "yes"


def test_classify_yes_no_regex_no() -> None:
    assert AuraAgent._classify_yes_no_regex("no don't") == "no"
    assert AuraAgent._classify_yes_no_regex("stop, cancel") == "no"
    assert AuraAgent._classify_yes_no_regex("hold on") == "no"


def test_classify_yes_no_regex_ambiguous() -> None:
    assert AuraAgent._classify_yes_no_regex("hmm maybe") == "ambiguous"
    assert AuraAgent._classify_yes_no_regex("yes but no") == "ambiguous"
    assert AuraAgent._classify_yes_no_regex("") == "ambiguous"


@pytest.mark.asyncio
async def test_turn_no_tools_streams_final_text(mute_audio, fake_openai) -> None:
    fake_openai(_llm_response(_llm_message(content="Hello, operator. Standing by.")))

    fleet = _mock_fleet()
    agent = AuraAgent(voice_id="v", fleet=fleet)

    user, reply = await agent.turn()
    assert user == "what is the fleet status"
    assert reply == "Hello, operator. Standing by."
    assert agent.history[-2]["role"] == "user"
    assert agent.history[-1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_turn_dispatches_free_tool_then_final(mute_audio, fake_openai) -> None:
    fake_openai(
        _llm_response(_llm_message(tool_calls=[{
            "id": "tc1", "name": "get_fleet_status", "arguments": "{}",
        }])),
        _llm_response(_llm_message(content="All three robots online.")),
    )

    fleet = _mock_fleet()
    agent = AuraAgent(voice_id="v", fleet=fleet)

    _, reply = await agent.turn()
    assert reply == "All three robots online."
    fleet.get_fleet_status.assert_awaited_once()


@pytest.mark.asyncio
async def test_paid_tool_aborted_when_user_says_no(mute_audio, fake_openai) -> None:
    fake_openai(
        _llm_response(_llm_message(tool_calls=[{
            "id": "tc1",
            "name": "investigate_anomaly",
            "arguments": json.dumps({"robot_id": "robot_02", "event_id": "TX_ABC"}),
        }])),
        _llm_response(_llm_message(content="Cancelled, standing by.")),
    )

    # Confirmation utterance: NO
    fleet = _mock_fleet()
    agent = AuraAgent(voice_id="v", fleet=fleet)

    # First _record_until_silence returns user prompt; second returns confirmation utterance.
    utterances = iter(["please investigate robot 2", "no don't"])

    async def fake_transcribe(wav, client):
        return next(utterances)

    mute_audio.setattr(agent_module, "_transcribe_whisper", fake_transcribe)

    _, reply = await agent.turn()
    assert reply == "Cancelled, standing by."
    fleet.trigger_inference_payment.assert_not_awaited()
    # confirmation_request + confirmation_resolved logs
    assert fleet.trigger_compliance_log.await_count >= 2
    log_payloads = [c.args[1] for c in fleet.trigger_compliance_log.await_args_list]
    assert any(p["tool_name"] == "confirmation_request" for p in log_payloads)
    assert any(
        p["tool_name"] == "confirmation_resolved" and p["decision"] == "no"
        for p in log_payloads
    )


@pytest.mark.asyncio
async def test_paid_tool_dispatched_when_user_says_yes(mute_audio, fake_openai, monkeypatch) -> None:
    fake_openai(
        _llm_response(_llm_message(tool_calls=[{
            "id": "tc1",
            "name": "investigate_anomaly",
            "arguments": json.dumps({"robot_id": "robot_02", "event_id": "TX_ABC"}),
        }])),
        _llm_response(_llm_message(content="Diagnosis complete.")),
    )

    fleet = _mock_fleet()
    fleet.get_recent_events = AsyncMock(return_value=[
        {"tx_signature": "TX_ABC", "reason_code": "joint_torque_spike", "severity": 2,
         "timestamp": "2026-05-09T12:00:00Z"}
    ])
    fleet.get_robot_status = AsyncMock(return_value={"id": "robot_02", "status": "anomaly"})

    # Patch the investigate tool's OpenAI call
    from aura.tools import investigate as investigate_module
    fake_invest_resp = MagicMock()
    fake_invest_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
        "proximate_cause": "gripper slip",
        "severity_assessment": "moderate",
        "recommended_action": "pause for inspection",
        "confidence_pct": 80,
    })))]
    fake_invest_oa = MagicMock()
    fake_invest_oa.chat.completions.create = AsyncMock(return_value=fake_invest_resp)
    monkeypatch.setattr(investigate_module, "AsyncOpenAI", lambda **_: fake_invest_oa)

    agent = AuraAgent(voice_id="v", fleet=fleet)

    utterances = iter(["please investigate robot 2", "yes go"])

    async def fake_transcribe(wav, client):
        return next(utterances)

    mute_audio.setattr(agent_module, "_transcribe_whisper", fake_transcribe)

    _, reply = await agent.turn()
    assert reply == "Diagnosis complete."
    fleet.trigger_inference_payment.assert_awaited_once_with(
        "robot_02", 800_000, "anomaly diagnosis"
    )


@pytest.mark.asyncio
async def test_text_agent_no_tools_prints_reply(fake_openai, capsys, monkeypatch) -> None:
    fake_openai(_llm_response(_llm_message(content="All three robots online.")))
    inputs = iter(["status check"])
    monkeypatch.setattr("builtins.input", lambda prompt="": next(inputs))

    fleet = _mock_fleet()
    agent = TextAgent(voice_id="v", fleet=fleet)
    user, reply = await agent.turn()

    assert user == "status check"
    assert reply == "All three robots online."
    out = capsys.readouterr().out
    assert "aura > All three robots online." in out


@pytest.mark.asyncio
async def test_text_agent_paid_tool_aborted_on_text_no(fake_openai, capsys, monkeypatch) -> None:
    fake_openai(
        _llm_response(_llm_message(tool_calls=[{
            "id": "tc1",
            "name": "investigate_anomaly",
            "arguments": json.dumps({"robot_id": "robot_02", "event_id": "TX_ABC"}),
        }])),
        _llm_response(_llm_message(content="Cancelled, standing by.")),
    )
    inputs = iter(["investigate robot 2", "no don't"])
    monkeypatch.setattr("builtins.input", lambda prompt="": next(inputs))

    fleet = _mock_fleet()
    agent = TextAgent(voice_id="v", fleet=fleet)
    _, reply = await agent.turn()

    assert reply == "Cancelled, standing by."
    fleet.trigger_inference_payment.assert_not_awaited()
    out = capsys.readouterr().out
    assert "Proceed?" in out  # confirmation prompt was printed


@pytest.mark.asyncio
async def test_selected_robot_context_injected_into_prompt(mute_audio, fake_openai) -> None:
    fake_openai(_llm_response(_llm_message(content="Acknowledged.")))

    fleet = _mock_fleet()
    selected = MagicMock()
    selected.current = MagicMock(return_value="robot_03")
    agent = AuraAgent(voice_id="v", fleet=fleet, selected=selected)

    await agent.turn()

    # Inspect the messages passed to OpenAI
    call_kwargs = agent_module.AsyncOpenAI(api_key="x").chat.completions.create.call_args.kwargs
    sent_messages = call_kwargs["messages"]
    system_msgs = [m["content"] for m in sent_messages if m["role"] == "system"]
    assert any("robot_03" in m for m in system_msgs)
