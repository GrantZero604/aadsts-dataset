Graph error-code lab run 2026-10-31: 10/17 scenarios returned the expected code.

| Scenario | Request | HTTP | Error code | Message (first line) |
|---|---|---|---|---|
| Read sign-in logs on a tenant without a premium licence | `GET /auditLogs/signIns?$top=1` | 403 | Authentication_MSGraphPermissionMissing ⚠️ | The principal does not have any one of the required Microsoft Graph permissions: AuditLog.Read.All to call this API. For more information about Microsoft Graph permissions, please visit https://learn. |
| Read directory audit logs without AuditLog.Read.All | `GET /auditLogs/directoryAudits?$top=1` | 403 | Authentication_MSGraphPermissionMissing ⚠️ | The principal does not have any one of the required Microsoft Graph permissions: AuditLog.Read.All to call this API. For more information about Microsoft Graph permissions, please visit https://learn. |
| Read Conditional Access policies without Policy.Read.All | `GET /identity/conditionalAccess/policies` | 403 | AccessDenied ⚠️ | You cannot perform the requested operation, required scopes are missing in the token. |
| Write a group without Group.ReadWrite.All | `POST /groups` | 403 | Authorization_RequestDenied  | Insufficient privileges to complete the operation. |
| Token issued for a different audience | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Access token validation failure. Invalid audience. |
| Token with a tampered signature | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Signature is invalid. |
| No Authorization header at all | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | UnableToParseTokens |
| Authorization header that is not a JWT | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Protocol 'Bearer' failed to validate because The token could not be read. |
| Count users without the ConsistencyLevel header | `GET /users?$count=true` | 200 | success ⚠️ |  |
| Count users with ConsistencyLevel: eventual (control) | `GET /users?$count=true` | 200 | success  |  |
| Filter on a property that does not exist | `GET /users?$filter=notARealProperty eq 'x'` | 400 | Request_UnsupportedQuery  | Property 'notARealProperty' does not exist as a declared property or extension property. |
| Object ID that is not a GUID | `GET /users/not-a-guid` | 404 | Request_ResourceNotFound  | Resource 'not-a-guid' does not exist or one of its queried reference-property objects are not present. |
| User object that does not exist | `GET /users/b7d9e487-036f-4e16-9ff8-73abcf6432b6` | 404 | Request_ResourceNotFound  | Resource 'b7d9e487-036f-4e16-9ff8-73abcf6432b6' does not exist or one of its queried reference-property objects are not present. |
| Path segment that does not exist | `GET /users/does/not/exist` | 400 | Request_BadRequest ⚠️ | Unexpected segment DynamicPathSegment. Expected property/$value. |
| Create a user with no required fields | `POST /users` | 400 | Request_BadRequest  | A password must be specified to create a new user. |
| Create a second user with the same userPrincipalName | `POST /users` | 400 | Request_BadRequest ⚠️ | Another object with the same value for property userPrincipalName already exists. |
| Burst of 120 identical reads | `GET /users?$top=1 x120` | 200 | no throttling seen ⚠️ | all 120 requests succeeded |

Objects created for this run were deleted afterwards. No tokens or secrets are recorded.
