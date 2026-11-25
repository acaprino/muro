`apache-2.0.txt` is the SPDX License List's Apache-2.0 text, used to test
recognition and notice preservation without network access during tests.
Source: https://github.com/spdx/license-list-data/blob/main/text/Apache-2.0.txt

`package/` is an invented package (Pressroom, a small publishing workflow) that the factory's own tests
borrow where they need a whole package: eight capabilities, a router, entries, a session policy from one
owner Markdown file, guide examples and eval cases. Its two sources are remotes that do not exist, so it
validates (`--validate`, `--check-sources --offline-pins`) and is never fetched or built. Tests read it in
place and write only in a copy (`routing_helpers.copy_fixture`); `tests/test_fixture_package.py` holds it
to the factory's validation and to the features other tests rely on.
