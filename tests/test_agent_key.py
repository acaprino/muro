"""The name of the API key's environment variable is a name, never the key (ADR-0022, ADR-0028).

`muro agent`, `muro absorb` and `muro project simulate` take `--api-key-env`; the desktop passes its setting
`ai.api_key_env` there. A key pasted into that place by mistake must be refused without ever being echoed.
"""
import pytest

from muro.agent import read_api_key
from muro.cli import _run_agent

REFUSED = "The key setting must name an environment variable, not hold a key"
KEY = "sk-live-0123456789abcdef"


@pytest.fixture(autouse=True)
def no_default_keys(monkeypatch):
    monkeypatch.delenv("MURO_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


@pytest.mark.parametrize("name", ["MY_KEY", "_KEY", "key2", "MURO_API_KEY", "a", "A" * 128])
def test_a_variable_name_is_read(monkeypatch, name):
    monkeypatch.setenv(name, "the-value")
    assert read_api_key(name) == "the-value"


@pytest.mark.parametrize("value", [
    KEY, "sk-ant-api03-abc_def", "has space", "1STARTS_WITH_A_DIGIT", "a=b", "key.with.dots", "naïve", "A" * 129,
    "zq9\n", "$(whoami)", "a;b", "bearer abc", "-x",
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


def test_the_agent_command_refuses_a_key_given_as_the_name_and_prints_none_of_it(tmp_path, capsys):
    assert _run_agent("review", None, {}, tmp_path, "https://api.openai.com/v1", "m", KEY, 1) == 1
    captured = capsys.readouterr()
    assert REFUSED in captured.err
    assert KEY not in captured.out + captured.err
