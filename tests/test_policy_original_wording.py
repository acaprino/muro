"""Absorbed content is not altered, except for harmonization and coexistence (owner, 2026-11-12).

"Non deve mai alterare il contenuto Muro, se non per garantire armonizzazione e
coesistenza in base ai suoi principi; solo in quel caso può riscriverne il contenuto."

The factory's prompts state the rule. That a real package's permanent policy carries its sources in
their own words is checked by that package's own tests, not here.
"""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize("prompt", ["intake.md", "harmonizer.md", "delivery.md"])
def test_the_factory_prompts_state_the_rule(prompt):
    text = " ".join((ROOT / "prompts" / prompt).read_text(encoding="utf-8").split())
    # Owner correction of the same day: the generated text is the LLM's, the substance is the source's.
    assert "weaken" in text and "source's" in text
    assert "harmonization and coexistence" in text
    assert "never for size" in text
