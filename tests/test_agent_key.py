"""The name of the API key's environment variable is a name, never the key (ADR-0022, ADR-0028).

`muro agent`, `muro absorb` and `muro project simulate` take `--api-key-env`; the desktop passes its setting
`ai.api_key_env` there. A key pasted into that place by mistake must be refused without ever being echoed.
"""
import io
import json

import pytest

from muro import agent
from muro.agent import read_api_key
from muro.cli import _run_agent

REFUSED = "The key setting must name an environment variable, not hold a key"
KEY = "sk-live-0123456789abcdef"


@pytest.fixture(autouse=True)
def no_default_keys(monkeypatch):
    monkeypatch.delenv("MURO_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


@pytest.mark.parametrize("name", ["MY_KEY", "_KEY", "_X1", "MURO_API_KEY", "OPENAI_API_KEY", "A", "A" * 64])
def test_a_variable_name_is_read(monkeypatch, name):
    monkeypatch.setenv(name, "the-value")
    assert read_api_key(name) == "the-value"


@pytest.mark.parametrize("value", [
    KEY, "sk-ant-api03-abc_def", "has space", "1STARTS_WITH_A_DIGIT", "a=b", "key.with.dots", "naïve", "A" * 65,
    "zq9\n", "$(whoami)", "a;b", "bearer abc", "-x",
    # keys of providers that carry no hyphen: they read as a name under a looser rule, and a name is echoed back
    "gsk_abc123", "hf_xyz", "Zk3dQp9RtLm2NvXw8YbHc5JfGs7AaE1uOi4TyP6e", "key2", "q9", "MixedCase_Key", "abcdef0123456789",
])
def test_a_value_that_is_not_a_variable_name_is_refused_without_echoing_it(monkeypatch, value):
    if "=" not in value and "\n" not in value and "\0" not in value:
        try:
            monkeypatch.setenv(value, "set-under-that-name")     # even a variable of that exact name is never read
        except (OSError, ValueError):
            pass
    with pytest.raises(ValueError) as refused:
        read_api_key(value)
    assert str(refused.value) == REFUSED
    assert value.strip() not in str(refused.value)


def test_no_name_means_the_defaults_as_before(monkeypatch):
    for unnamed in (None, ""):
        with pytest.raises(ValueError, match="MURO_API_KEY or OPENAI_API_KEY"):
            read_api_key(unnamed)
    monkeypatch.setenv("OPENAI_API_KEY", "the-default")
    assert read_api_key(None) == "the-default"
    assert read_api_key("") == "the-default"
    monkeypatch.setenv("MURO_API_KEY", "the-first")
    assert read_api_key(None) == "the-first"


def test_a_name_that_is_not_set_still_says_which_one_to_set(monkeypatch):
    with pytest.raises(ValueError, match="No API key: set NOT_SET_ANYWHERE"):
        read_api_key("NOT_SET_ANYWHERE")


class _Reply:
    """What `urllib.request.urlopen` gives: a context manager over a JSON body."""

    def __init__(self, document):
        self.body = json.dumps(document).encode("utf-8")

    def __enter__(self):
        return io.BytesIO(self.body)

    def __exit__(self, *exc):
        return False


@pytest.mark.parametrize("base", ["https://api.example.com/v1", "HTTPS://api.example.com/v1", "Https://API.example.com/v1",
                                  "http://localhost:8080/v1", "HTTP://LOCALHOST:8080/v1", "HTTP://127.0.0.1:8080/v1"])
def test_the_scheme_of_the_endpoint_is_compared_without_regard_to_case(monkeypatch, base):
    sent = []
    monkeypatch.setattr(agent.urllib.request, "urlopen", lambda request, timeout: sent.append(request) or
                        _Reply({"choices": [{"message": {"content": "ok"}}]}))
    assert agent._post_chat(base, "k", "m", [{"role": "user", "content": "hi"}]) == "ok"
    assert len(sent) == 1


@pytest.mark.parametrize("base", ["http://example.com/v1", "HTTP://example.com/v1", "Http://example.com/v1",
                                  "HTTP://localhost.evil.example/v1", "ftp://example.com/v1"])
def test_plain_http_is_refused_off_localhost_whatever_its_case(monkeypatch, base):
    monkeypatch.setattr(agent.urllib.request, "urlopen", lambda *a, **k: pytest.fail("the request must not be sent"))
    with pytest.raises(ValueError, match="https"):
        agent._post_chat(base, "k", "m", [{"role": "user", "content": "hi"}])


def test_the_agent_command_refuses_a_key_given_as_the_name_and_prints_none_of_it(tmp_path, capsys):
    assert _run_agent("review", None, {}, tmp_path, "https://api.openai.com/v1", "m", KEY, 1) == 1
    captured = capsys.readouterr()
    assert REFUSED in captured.err
    assert KEY not in captured.out + captured.err
