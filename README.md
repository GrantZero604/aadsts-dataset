# AADSTS sign-in error codes: attack signal, MITRE technique and category

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23641385.svg)](https://doi.org/10.5281/zenodo.23641385)

An open dataset that classifies Microsoft Entra ID `AADSTS` sign-in error codes for security triage: whether a code is a failure, an interrupt or a configuration issue, how much attack signal it usually carries, which MITRE ATT&CK techniques it relates to, which sign-in log tables it shows up in, and which codes are related.

- **Browse it with explanations and KQL:** https://brambrinkmeier.com/entra/aadsts/
- **Microsoft Graph error codes:** https://brambrinkmeier.com/entra/graph/
- **Copy-paste KQL lookup table:** https://brambrinkmeier.com/aadsts-kql-lookup/
- **Live JSON (always current):** https://brambrinkmeier.com/aadsts.json

## Files

| File | What |
|---|---|
| `aadsts.json` | The AADSTS dataset with metadata (license, attribution, generation date) |
| `aadsts.csv` | Same rows as CSV; list fields are separated by `;` |
| `graph-errors.json` | Microsoft Graph error codes, with the exact message the live service returned |
| `graph-errors.csv` | Same rows as CSV |
| `lab/` | The scripts that produced the lab results, and the raw output of every run |

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
| `kqlTested` | Date the page's KQL was run against exported lab rows, if any |
| `url` | Page with the full explanation, attack patterns and KQL |

Only the author's own classification is included. Microsoft's error descriptions are not redistributed; see Microsoft's [error code reference](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes).

## Use in KQL

```kusto
let aadsts = externaldata(code:string, name:string, category:string, kind:string, attackSignal:string, mitre:string, tables:string, related:string, status:string, verification:string, labReproduced:string, logCaptured:string, kqlTested:string, updated:string, url:string, inMicrosoftReference:bool)
  [@"https://raw.githubusercontent.com/GrantZero604/aadsts-dataset/main/aadsts.csv"]
  with (format="csv", ignoreFirstRecord=true);
SigninLogs
| where TimeGenerated > ago(1d) and ResultType != "0"
| join kind=leftouter aadsts on $left.ResultType == $right.code
| summarize count() by ResultType, name, attackSignal
```

## Microsoft Graph error codes

`graph-errors.json` and `graph-errors.csv` are a second, smaller dataset: the named error codes Microsoft Graph returns on calls against Microsoft Entra ID.

It exists because Microsoft publishes no current reference for them. [Microsoft's Graph error page](https://learn.microsoft.com/graph/errors) lists HTTP status codes and names no error codes at all; most of the named codes survive only in a [retired Azure AD Graph page](https://learn.microsoft.com/en-us/previous-versions/azure/ad/graph/howto/azure-ad-graph-api-error-codes-and-error-handling) last updated in 2016. Every `message` in this file is what Graph v1.0 actually returned in a lab tenant, quoted as returned, so the file is a record of current behaviour rather than a copy of documentation.

| Field | Meaning |
|---|---|
| `code` | The Graph error code string, e.g. `Authorization_RequestDenied` |
| `httpStatus` | The HTTP status that accompanied it |
| `category` | permissions, query or request |
| `attackSignal` | high, medium or low |
| `inMicrosoftGraphDocs` | `false` when no Microsoft page defining the code was found (checked 31 Oct 2026) |
| `checked` | Date that check was made |
| `labReproduced` / `scenario` / `message` | When the code was reproduced, the request that produced it, and Graph's first message line |
| `url` | Page with the full explanation and the fix |

## How the lab results were produced

`lab/` holds everything behind the `lab-reproduced` rows, so the claims on the site can be checked or re-run rather than taken on trust.

| Path | What |
|---|---|
| `lab/error-codes.mjs` | Reproduces AADSTS sign-in errors against a lab tenant |
| `lab/graph-errors.mjs` | Reproduces Microsoft Graph error codes against the same tenant |
| `lab/workflows/` | The GitHub Actions workflows that run them |
| `lab/runs/` | Raw output of every run, dated |

Both scripts authenticate with a GitHub OIDC federated credential, so no client secret exists to leak. They create temporary users and app registrations with random one-time passwords, generated inside the runner and masked in the log, and delete everything they created at the end of the run. No passwords, tokens or correlation IDs are written to the output. The tenant and app IDs in the workflows are identifiers, not secrets.

`graph-errors.mjs` also records the application permissions in its own token, read from the token's `roles` claim, so results that depend on a permission being absent rest on a measurement rather than on an assumption about the app registration.

Two things the runs corrected about themselves, kept here because they are the kind of defect that quietly invalidates a measurement: a scenario labelled "no `Authorization` header" was in fact sending an empty bearer value, which is a different error with a different message; and an early version truncated long messages, so a quoted message ended mid-URL. Both were found by review rather than by the script.

## Cite

Cite via DOI [10.5281/zenodo.23641385](https://doi.org/10.5281/zenodo.23641385) (Zenodo; always resolves to the latest version). Version DOIs: 1.1.0 is [10.5281/zenodo.23816201](https://doi.org/10.5281/zenodo.23816201), 1.0.0 is [10.5281/zenodo.23641386](https://doi.org/10.5281/zenodo.23641386), or see `CITATION.cff`. The data in this repository is synced with the live site JSON and currently has **98 AADSTS codes**, 43 of them missing from Microsoft's error reference, plus **8 Microsoft Graph error codes**. 34 AADSTS codes were reproduced in a lab tenant, 16 of those with the sign-in log row read and 11 with the page's KQL run against it; `verification`, `logCaptured` and `kqlTested` show which.

## License

[CC BY 4.0](./LICENSE). Bram Brinkmeier, https://brambrinkmeier.com/
