"""Hook command arguments stay data when the host dispatches through a shell."""
import json
import os
import shutil
import subprocess

import pytest

from muro.delivery import _command


@pytest.fixture(params=["cmd", "powershell", "sh"])
def host_shell(request):
    kind = request.param
    if kind in {"cmd", "powershell"} and os.name != "nt":
        pytest.skip("Windows shell boundary")
    if kind == "sh" and os.name == "nt":
        pytest.skip("POSIX shell boundary")
    executable = shutil.which({"cmd": "cmd.exe", "powershell": "powershell.exe", "sh": "sh"}[kind])
    if not executable:
        pytest.skip(f"{kind} is unavailable")

    def invoke(command, cwd, environment, stdin=""):
        options = dict(cwd=cwd, env=environment, input=stdin, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=30)
        if kind == "cmd":
            return subprocess.run(command, shell=True, executable=executable, **options)
        arguments = (["-NoProfile", "-Command"] if kind == "powershell" else ["-c"])
        if kind == "powershell":
            command += "; exit $LASTEXITCODE"
        return subprocess.run([executable, *arguments, command], **options)

    return invoke


@pytest.mark.parametrize("root_variable", ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"])
def test_host_shell_preserves_argv_stdin_and_exit_without_expanding_data(tmp_path, host_shell, root_variable):
    # Expanding the installed path in the shell changes $(20+22) and loses the script.
    root = tmp_path / "installed package $(20+22) & price$"
    package = root / "skills" / "paper-crane"
    package.mkdir(parents=True)
    script = package / "inspect.py"
    script.write_text(
        "import json, sys\n"
        "sys.stdout.reconfigure(encoding='utf-8')\n"
        "print(json.dumps({'args': sys.argv[1:], 'stdin': sys.stdin.read()}, ensure_ascii=False))\n"
        "sys.stderr.write('declared stderr\\n')\n"
        "raise SystemExit(23)\n", encoding="utf-8",
    )
    consumer = tmp_path / "unrelated project"
    consumer.mkdir()
    arguments = [
        "two words", "price$(20+22)", "$HOME", "%MURO_ARGV_SENTINEL%",
        "`echo marker`", 'a "quoted" value', "ends-with-backslash\\", "città 🐎",
        "line one\nline two", "<package_root>/resource.txt",
    ]
    command = _command(["python", "<package_root>/inspect.py", *arguments],
                       "${" + root_variable + "}/skills/paper-crane")
    environment = dict(os.environ, **{root_variable: str(root)}, MURO_ARGV_SENTINEL="EXPANDED")
    incoming = '{"hook_event_name":"SessionStart","message":"from host"}'

    done = host_shell(command, consumer, environment, incoming)

    assert done.returncode == 23, done.stdout + done.stderr
    assert json.loads(done.stdout) == {
        "args": [*arguments[:-1], str(root) + "/skills/paper-crane/resource.txt"],
        "stdin": incoming,
    }
    assert done.stderr == "declared stderr\n"
    assert list(consumer.iterdir()) == []


def test_program_name_is_not_shell_code(tmp_path, host_shell):
    command = _command(["missing-program;echo", "marker"], "unused")

    done = host_shell(command, tmp_path, dict(os.environ))

    assert done.returncode != 0
    assert done.stdout == ""
    assert "FileNotFoundError" in done.stderr
    assert list(tmp_path.iterdir()) == []


@pytest.mark.skipif(os.name != "nt", reason="Windows executes batch files through cmd even with shell=False")
@pytest.mark.parametrize("extension", ["cmd", "bat"])
def test_windows_batch_program_does_not_reinterpret_declared_arguments(tmp_path, host_shell, extension):
    script = tmp_path / ("fixture." + extension)
    script.write_text("@echo off\necho fixture\n", encoding="ascii")
    environment = dict(os.environ, PATH=str(tmp_path) + os.pathsep + os.environ["PATH"])
    command = _command([script.name, "&echo", "UNDECLARED"], "unused")

    done = host_shell(command, tmp_path, environment)

    assert done.returncode != 0
    assert done.stdout == ""
    assert "Windows batch hooks require an explicit executable" in done.stderr
