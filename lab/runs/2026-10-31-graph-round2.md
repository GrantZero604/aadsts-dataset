Graph error-code lab run 2026-10-31: 23/34 scenarios returned the expected code.

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
| User object that does not exist | `GET /users/3b3b7f78-e823-4c89-81fe-836d9c6605e1` | 404 | Request_ResourceNotFound  | Resource '3b3b7f78-e823-4c89-81fe-836d9c6605e1' does not exist or one of its queried reference-property objects are not present. |
| Path segment that does not exist | `GET /users/does/not/exist` | 400 | Request_BadRequest ⚠️ | Unexpected segment DynamicPathSegment. Expected property/$value. |
| Create a user with no required fields | `POST /users` | 400 | Request_BadRequest  | A password must be specified to create a new user. |
| Create a second user with the same userPrincipalName | `POST /users` | 400 | Request_BadRequest ⚠️ | Another object with the same value for property userPrincipalName already exists. |
| Count users without the ConsistencyLevel header | `GET /users?$count=true` | 200 | success  |  |
| Advanced-query filter (endsWith) without the ConsistencyLevel header | `GET /users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')` | 400 | Request_UnsupportedQuery  | Operator 'endsWith' is not supported because the 'ConsistencyLevel:eventual' header is missing. Refer to https://aka.ms/graph-docs/advanced-queries for more information |
| Advanced-query filter with ConsistencyLevel: eventual (control) | `GET /users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')&$count=true` | 200 | success  |  |
| $search without the ConsistencyLevel header | `GET /users?$search="displayName:lab"` | 400 | Request_UnsupportedQuery  | Request with $search query parameter only works through MSGraph with a special request header: 'ConsistencyLevel: eventual' |
| $top above the page-size limit | `GET /users?$top=5000` | 400 | Request_UnsupportedQuery  | Invalid page size specified: '5000'. Must be between 1 and 999 inclusive. |
| $select naming a property that does not exist | `GET /users?$select=notARealProperty` | 200 | success ⚠️ |  |
| Same missing object, applications instead of users | `GET /applications/ad2f3be9-3226-48f8-b0b3-61a9fd4af7af` | 404 | Request_ResourceNotFound  | Resource 'ad2f3be9-3226-48f8-b0b3-61a9fd4af7af' does not exist or one of its queried reference-property objects are not present. |
| Same missing object, groups instead of users | `GET /groups/d784b3a8-8399-49b5-abbb-65927b35e5b9` | 403 | Authorization_RequestDenied ⚠️ | Insufficient privileges to complete the operation. |
| Same missing object, servicePrincipals instead of users | `GET /servicePrincipals/84a128f7-1723-49d6-9b5e-4f88eb2b1af0` | 404 | Request_ResourceNotFound  | Resource '84a128f7-1723-49d6-9b5e-4f88eb2b1af0' does not exist or one of its queried reference-property objects are not present. |
| Same missing object, directoryRoles instead of users | `GET /directoryRoles/57dcca83-2fa1-4d08-8a35-68febd4a91ef` | 403 | Authorization_RequestDenied ⚠️ | Insufficient privileges to complete the operation. |
| A method the collection does not allow | `DELETE /users` | 405 | Request_BadRequest  | Specified HTTP method is not allowed for the request target. |
| Top-level path that is not a Graph resource | `GET /notAResource` | 400 | BadRequest  | Resource not found for the segment 'notAResource'. |
| Request body that is not valid JSON | `POST /users` | 400 | BadRequest  | Unable to read JSON request payload. Please ensure Content-Type header is set and payload is of valid JSON format. |
| Authorization header with a scheme other than Bearer | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Protocol 'Bearer' failed to validate because The token could not be read. |
| Delete an object that is already deleted | `DELETE /users/c7cca210-7744-49c3-ab10-d34288d6efee` | 404 | Request_ResourceNotFound  | Resource 'c7cca210-7744-49c3-ab10-d34288d6efee' does not exist or one of its queried reference-property objects are not present. |
| Same sign-in log read on the beta endpoint | `GET /auditLogs/signIns?$top=1` | 403 | Authentication_MSGraphPermissionMissing  | The principal does not have any one of the required Microsoft Graph permissions: AuditLog.Read.All to call this API. For more information about Microsoft Graph permissions, please visit https://learn. |
| Did the uncounted request actually return @odata.count? | `GET /users?$count=true` | 200 | observation  | see countPresent |
| Burst of up to 400 identical reads, 20 at a time | `GET /users?$top=1 (concurrent)` | 200 | no throttling seen ⚠️ | all 400 requests succeeded |

Objects created for this run were deleted afterwards. No tokens or secrets are recorded.
