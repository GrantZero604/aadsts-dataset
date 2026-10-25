# AADSTS sign-in error codes: attack signal, MITRE technique and category

An open dataset that classifies Microsoft Entra ID `AADSTS` sign-in error codes for security triage: whether a code is a failure, an interrupt or a configuration issue, how much attack signal it usually carries, which MITRE ATT&CK techniques it relates to, which sign-in log tables it shows up in, and which codes are related.

- **Browse it with explanations and KQL:** https://brambrinkmeier.com/entra/aadsts/
- **Copy-paste KQL lookup table:** https://brambrinkmeier.com/aadsts-kql-lookup/
- **Live JSON (always current):** https://brambrinkmeier.com/aadsts.json

## Files

| File | What |
|---|---|
| `aadsts.json` | The dataset with metadata (license, attribution, generation date) |
| `aadsts.csv` | Same rows as CSV; list fields are separated by `;` |

## Fields

| Field | Meaning |
|---|---|
| `code` | AADSTS code number (string) |
| `name` | Microsoft's error name identifier |
| `category` | credentials, mfa, conditional-access, consent, app-config, token, device, b2b-tenant |
| `kind` | failure, interrupt or config |
| `attackSignal` | high, medium or low: how often the code matters in an investigation |
| `mitre` | Related MITRE ATT&CK technique IDs |
| `tables` | Log Analytics tables where the code appears |
| `related` | Codes that are usually read together with this one |
| `status` | draft or verified (verified = reproduced in a lab tenant) |
| `updated` | Last review date |
| `url` | Page with the full explanation, attack patterns and KQL |

Only the author's own classification is included. Microsoft's error descriptions are not redistributed; see Microsoft's [error code reference](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes).

## Use in KQL

```kusto
let aadsts = externaldata(code:string, name:string, category:string, kind:string, attackSignal:string)
  [@"https://raw.githubusercontent.com/GrantZero604/aadsts-dataset/main/aadsts.csv"]
  with (format="csv", ignoreFirstRecord=true);
SigninLogs
| where TimeGenerated > ago(1d) and ResultType != "0"
| join kind=leftouter aadsts on $left.ResultType == $right.code
| summarize count() by ResultType, name, attackSignal
```

## Cite

See `CITATION.cff`, or the DOI badge once released on Zenodo.

## License

[CC BY 4.0](./LICENSE). Bram Brinkmeier, https://brambrinkmeier.com/
