"""Module 1.2 — Transform & Cleanse Layer.

Validates extracted records and formats them to NFIU compliance standards.
"""

import re
from pathlib import Path

from app.core.config import settings
from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.pep_registry import PepRegistry

ACCOUNT_PATTERN = re.compile(r"^\d{10}$")
PEP_KEYWORDS = ("politically exposed", "pep", "senator", "minister", "governor")
STR_KEYWORDS = (
    "crypto",
    "bitcoin",
    "gambling",
    "shell company",
    "anonymous",
    "hawala",
    "terror",
    "sanction",
    "money mule",
)
SANCTIONS_NAMES = ("hassan ibrahim", "shell nigeria")


class TransactionTransformer:
    """Validate and normalize transactions for NFIU staging."""

    def __init__(self, pep_registry: PepRegistry | None = None) -> None:
        self.pep_registry = pep_registry or PepRegistry.from_csv(
            Path(settings.finacle_samples_dir) / "PEP_CUSTOMERS.csv"
        )

    def transform(self, raw: RawTransaction) -> tuple[dict, bool, list[str]]:
        errors: list[str] = []

        if raw.amount <= 0:
            errors.append("Amount must be positive")
        if not raw.sender_name.strip():
            errors.append("Sender name is required")
        if not raw.receiver_name.strip():
            errors.append("Receiver name is required")
        if not ACCOUNT_PATTERN.match(raw.sender_account):
            errors.append("Invalid sender account format (expected 10 digits)")
        if not ACCOUNT_PATTERN.match(raw.receiver_account):
            errors.append("Invalid receiver account format (expected 10 digits)")

        reportable_ctr = self._is_ctr_reportable(raw)
        reportable_ftr = self._is_ftr_reportable(raw)
        reportable_pep = self._is_pep_reportable(raw)
        reportable_str = self._is_str_reportable(raw, reportable_pep)

        nfiu_payload = {
            "reportingEntity": "NOVA_BANK_NG",
            "transactionReference": raw.finacle_ref,
            "transactionDate": raw.transaction_date.isoformat(),
            "transactionType": raw.channel.value,
            "amountLocal": raw.amount if raw.currency == "NGN" else None,
            "amountForeign": raw.amount if raw.currency != "NGN" else None,
            "currencyCode": raw.currency,
            "originator": {
                "fullName": raw.sender_name.strip().upper(),
                "accountNumber": raw.sender_account,
            },
            "beneficiary": {
                "fullName": raw.receiver_name.strip().upper(),
                "accountNumber": raw.receiver_account,
            },
            "branchCode": raw.branch_code,
            "narration": raw.narration or "",
            "reportFlags": {
                "CTR": reportable_ctr,
                "FTR": reportable_ftr,
                "PEP": reportable_pep,
                "STR": reportable_str,
            },
        }

        is_valid = len(errors) == 0
        return nfiu_payload, is_valid, errors

    def _is_ctr_reportable(self, raw: RawTransaction) -> bool:
        if raw.currency != "NGN":
            return False
        return raw.amount >= settings.ctr_threshold_ngn

    def _is_ftr_reportable(self, raw: RawTransaction) -> bool:
        return raw.currency != "NGN" and raw.amount >= settings.ftr_threshold_usd

    def _is_pep_reportable(self, raw: RawTransaction) -> bool:
        if self.pep_registry.is_pep_account(raw.sender_account):
            return True
        if self.pep_registry.is_pep_account(raw.receiver_account):
            return True
        if self.pep_registry.is_pep_name(raw.sender_name):
            return True
        if self.pep_registry.is_pep_name(raw.receiver_name):
            return True
        combined = f"{raw.sender_name} {raw.receiver_name}".lower()
        return any(keyword in combined for keyword in PEP_KEYWORDS)

    def _is_str_reportable(self, raw: RawTransaction, reportable_pep: bool) -> bool:
        combined = f"{raw.sender_name} {raw.receiver_name} {raw.narration or ''}".lower()
        if any(keyword in combined for keyword in STR_KEYWORDS):
            return True
        if any(name in combined for name in SANCTIONS_NAMES):
            return True
        if reportable_pep and raw.amount >= 1_000_000:
            return True
        # Structuring: just below CTR threshold
        if raw.currency == "NGN" and settings.ctr_threshold_ngn * 0.9 <= raw.amount < settings.ctr_threshold_ngn:
            return True
        return False
