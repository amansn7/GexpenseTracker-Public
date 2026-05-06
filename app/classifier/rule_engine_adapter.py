from app.classifier.transaction_extractor import extract as _extract


class RuleEngineAdapter:
    def extract(self, subject: str, body: str) -> dict:
        return _extract(subject, body)


rule_engine_adapter = RuleEngineAdapter()
