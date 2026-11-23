import io, json, threading
from muro.jsonrpc import METHOD_NOT_FOUND, error, read_messages, result, tool_result, write_message

def test_one_message_is_one_flushed_line_with_text_kept_as_written():
    out = io.StringIO()
    write_message(result(3, {"x": "è"}), out)
    assert out.getvalue() == '{"jsonrpc": "2.0", "id": 3, "result": {"x": "è"}}\n'

def test_blank_lines_are_skipped_and_a_line_that_is_not_an_object_is_none():
    lines = io.StringIO('\n{"id": 1}\nnot json\n[1]\n{"id": 2}\n')
    assert list(read_messages(lines)) == [{"id": 1}, None, None, {"id": 2}]

def test_error_and_tool_result_shapes():
    assert error(4, METHOD_NOT_FOUND, "no")["error"] == {"code": -32601, "message": "no"}
    assert tool_result("done") == {"content": [{"type": "text", "text": "done"}], "isError": False}
    assert tool_result("bad", True)["isError"] is True

def test_the_lock_is_held_for_the_write_and_the_flush():
    lock, held = threading.Lock(), []
    class Stream(io.StringIO):
        def write(self, text):
            held.append(lock.locked())
            return super().write(text)
        def flush(self):
            held.append(lock.locked())
    write_message(result(1, {}), Stream(), lock)
    assert held == [True, True] and not lock.locked()

def test_the_stream_defaults_to_stdout_as_it_is_when_called(capsys):
    write_message(result(1, {}))
    assert capsys.readouterr().out == '{"jsonrpc": "2.0", "id": 1, "result": {}}\n'
