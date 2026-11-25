/** Static examples for Integration API docs (matches GET /export/transactions NFIU layout). */

const SAMPLE_TRANSACTION = {
  t_account_number: "1007000879",
  t_trans_number: "M00000347-500000-1003001861",
  t_location: "HEAD OFFICE BRANCH",
  transaction_description: "NIP transfer / same-day DTD leg",
  t_date: "2026-10-22",
  t_teller: "SYSTEM",
  t_authorized: "SYSTEM",
  t_late_deposit: 0,
  t_date_posting: "2026-10-22",
  t_value_date: "2026-10-22",
  t_transmode_code: "C",
  t_amount_local: 5000000,
  t_source_client_type: 1,
  t_source_type: "Account",
  t_source_funds_code: "L",
  t_source_currency_code: "NGN",
  t_source_foreign_amount: 0,
  t_source_exchange_rate: 1,
  t_source_country: "NG",
  t_source_institution_code: "60003",
  t_source_institution_name: "NOVA BANK",
  t_source_account_number: "1003001861",
  t_source_account_name: "MAYOWA VICTOR OYENIRAN",
  t_source_person_first_name: "MAYOWA",
  t_source_person_last_name: "VICTOR OYENIRAN",
  t_source_entity_name: "",
  t_dest_client_type: 0,
  t_dest_type: "Account",
  t_dest_funds_code: "L",
  t_dest_currency_code: "NGN",
  t_dest_foreign_amount: 0,
  t_dest_exchange_rate: 1,
  t_dest_country: "NG",
  t_dest_institution_code: "057",
  t_dest_institution_name: "ZENITH BANK PLC",
  t_dest_account_number: "1007000879",
  t_dest_account_name: "ESOCITY INTERGATED LIMITED",
  t_dest_person_first_name: "",
  t_dest_person_last_name: "",
  t_dest_entity_name: "ESOCITY INTERGATED LIMITED",
  processed_date: "2026-10-22",
  issues: "",
  branch_name: "HEAD OFFICE BRANCH",
  Tran_Type: "NIP",
};

/** A non-NIP leg: identical columns. Institution fields are filled from NIP flow tables, so they stay empty here. */
const SAMPLE_RTGS_TRANSACTION = {
  ...SAMPLE_TRANSACTION,
  t_account_number: "1003004410",
  t_trans_number: "M00000412-90000000-1003004410",
  transaction_description: "RTGS PAYMENT EZE MOTORS LTD",
  t_amount_local: 90000000,
  t_source_institution_code: "",
  t_source_institution_name: "",
  t_source_account_number: "1003002275",
  t_source_account_name: "ADA OBI",
  t_source_person_first_name: "ADA",
  t_source_person_last_name: "OBI",
  t_dest_institution_code: "",
  t_dest_institution_name: "",
  t_dest_account_number: "1003004410",
  t_dest_account_name: "EZE MOTORS LTD",
  t_dest_entity_name: "EZE MOTORS LTD",
  Tran_Type: "RTGS",
};

type ListMeta = {
  period_start: string;
  period_end: string;
  report_type: string | null;
  scope: string;
  channel: string;
  ctr_threshold_ngn: number | null;
  total_matching: number;
  returned: number;
  offset: number;
  limit: number | null;
  generated_at: string;
};

function listResponse(meta: ListMeta, transactions: object[] = [SAMPLE_TRANSACTION]) {
  return JSON.stringify(
    {
      meta,
      transactions,
    },
    null,
    2,
  );
}

const SAMPLE_GENERATED_AT = "2026-10-22T14:30:00Z";

export function integrationSampleResponse(endpointId: string): string | undefined {
  switch (endpointId) {
    case "transactions":
      return listResponse({
        period_start: "2026-10-20T00:00:00+01:00",
        period_end: "2026-10-22T23:59:59.999999+01:00",
        report_type: null,
        scope: "all",
        channel: "NIP",
        ctr_threshold_ngn: null,
        total_matching: 1284,
        returned: 1,
        offset: 0,
        limit: null,
        generated_at: SAMPLE_GENERATED_AT,
      });
    case "transactions-ctr":
      return listResponse({
        period_start: "2026-10-20T00:00:00+01:00",
        period_end: "2026-10-22T23:59:59.999999+01:00",
        report_type: "CTR",
        scope: "ctr",
        channel: "NIP",
        ctr_threshold_ngn: 5000000,
        total_matching: 42,
        returned: 1,
        offset: 0,
        limit: null,
        generated_at: SAMPLE_GENERATED_AT,
      });
    case "ctr-all":
      return listResponse(
        {
          period_start: "2026-10-20T00:00:00+01:00",
          period_end: "2026-10-22T23:59:59.999999+01:00",
          report_type: "CTR",
          scope: "ctr_all_channels",
          channel: "ALL",
          ctr_threshold_ngn: 5000000,
          total_matching: 57,
          returned: 2,
          offset: 0,
          limit: null,
          generated_at: SAMPLE_GENERATED_AT,
        },
        [SAMPLE_TRANSACTION, SAMPLE_RTGS_TRANSACTION],
      );
    case "dtd":
      return listResponse({
        period_start: "2026-10-22T00:00:00+01:00",
        period_end: "2026-10-22T23:59:59.999999+01:00",
        report_type: null,
        scope: "dtd",
        channel: "NIP",
        ctr_threshold_ngn: null,
        total_matching: 318,
        returned: 1,
        offset: 0,
        limit: null,
        generated_at: SAMPLE_GENERATED_AT,
      });
    case "transactions-all":
      return listResponse(
        {
          period_start: "2026-10-20T00:00:00+01:00",
          period_end: "2026-10-22T23:59:59.999999+01:00",
          report_type: null,
          scope: "all_channels",
          channel: "ALL",
          ctr_threshold_ngn: null,
          total_matching: 1311,
          returned: 2,
          offset: 0,
          limit: null,
          generated_at: SAMPLE_GENERATED_AT,
        },
        [SAMPLE_TRANSACTION, SAMPLE_RTGS_TRANSACTION],
      );
    case "dtd-all":
      return listResponse(
        {
          period_start: "2026-10-22T00:00:00+01:00",
          period_end: "2026-10-22T23:59:59.999999+01:00",
          report_type: null,
          scope: "dtd_all_channels",
          channel: "ALL",
          ctr_threshold_ngn: null,
          total_matching: 327,
          returned: 2,
          offset: 0,
          limit: null,
          generated_at: SAMPLE_GENERATED_AT,
        },
        [SAMPLE_TRANSACTION, SAMPLE_RTGS_TRANSACTION],
      );
    case "transaction-one":
      return JSON.stringify(SAMPLE_TRANSACTION, null, 2);
    default:
      return undefined;
  }
}
