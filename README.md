# AADSTS sign-in error codes: attack signal, MITRE technique and category

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23641386.svg)](https://doi.org/10.5281/zenodo.23641386)

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
| `status` | draft or verified (editorial status of the page) |
| `verification` | documentation (based on Microsoft documentation), lab-reproduced (a lab run returned the code; see `logCaptured` for whether the sign-in log row was read) or lab-verified |
| `labReproduced` | Date of the lab reproduction, if any |
| `inMicrosoftReference` | `false` when Microsoft's error code reference doesn't list the code (checked 30 Oct 2026); those pages use lab results, other Microsoft pages or user reports |
| `logCaptured` | Date a lab sign-in log row was read for the code, if any |
| `updated` | Last review date |
| `url` | Page with the full explanation, attack patterns and KQL |

Only the author's own classification is included. Microsoft's error descriptions are not redistributed; see Microsoft's [error code reference](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes).

## Use in KQL

```kusto
let aadsts = externaldata(code:string, name:string, category:string, kind:string, attackSignal:string, mitre:string, tables:string, related:string, status:string, verification:string, labReproduced:string, updated:string, url:string, inMicrosoftReference:bool, logCaptured:string)
  [@"https://raw.githubusercontent.com/GrantZero604/aadsts-dataset/main/aadsts.csv"]
  with (format="csv", ignoreFirstRecord=true);
SigninLogs
| where TimeGenerated > ago(1d) and ResultType != "0"
| join kind=leftouter aadsts on $left.ResultType == $right.code
| summarize count() by ResultType, name, attackSignal
```

## Cite

Cite via DOI [10.5281/zenodo.23641386](https://doi.org/10.5281/zenodo.23641386) (Zenodo; this is the DOI of version 1.0.0), or see `CITATION.cff`. The data in this repository is synced with the live site JSON and currently has 90 codes, 39 of them missing from Microsoft's error reference; `verification` shows which codes were reproduced in a lab tenant.

## License

[CC BY 4.0](./LICENSE). Bram Brinkmeier, https://brambrinkmeier.com/
