Graph error-code lab run 2026-10-31: 35/48 scenarios returned the expected code.

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
| User object that does not exist | `GET /users/df06f1ba-ce51-4326-a654-b33b98dc81e4` | 404 | Request_ResourceNotFound  | Resource 'df06f1ba-ce51-4326-a654-b33b98dc81e4' does not exist or one of its queried reference-property objects are not present. |
| Path segment that does not exist | `GET /users/does/not/exist` | 400 | Request_BadRequest ⚠️ | Unexpected segment DynamicPathSegment. Expected property/$value. |
| Create a user with no required fields | `POST /users` | 400 | Request_BadRequest  | A password must be specified to create a new user. |
| Create a second user with the same userPrincipalName | `POST /users` | 400 | Request_BadRequest ⚠️ | Another object with the same value for property userPrincipalName already exists. |
| Count users without the ConsistencyLevel header | `GET /users?$count=true` | 200 | success  |  |
| Advanced-query filter (endsWith) without the ConsistencyLevel header | `GET /users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')` | 400 | Request_UnsupportedQuery  | Operator 'endsWith' is not supported because the 'ConsistencyLevel:eventual' header is missing. Refer to https://aka.ms/graph-docs/advanced-queries for more information |
| Advanced-query filter with ConsistencyLevel: eventual (control) | `GET /users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')&$count=true` | 200 | success  |  |
| $search without the ConsistencyLevel header | `GET /users?$search="displayName:lab"` | 400 | Request_UnsupportedQuery  | Request with $search query parameter only works through MSGraph with a special request header: 'ConsistencyLevel: eventual' |
| $top above the page-size limit | `GET /users?$top=5000` | 400 | Request_UnsupportedQuery  | Invalid page size specified: '5000'. Must be between 1 and 999 inclusive. |
| $select naming a property that does not exist | `GET /users?$select=notARealProperty` | 200 | success ⚠️ |  |
| Same missing object, applications instead of users | `GET /applications/fba57c38-ac19-486c-999d-24b9f6fb204f` | 404 | Request_ResourceNotFound  | Resource 'fba57c38-ac19-486c-999d-24b9f6fb204f' does not exist or one of its queried reference-property objects are not present. |
| Same missing object, groups instead of users | `GET /groups/6a824842-abe2-4e3d-8570-a621a7a99bc6` | 403 | Authorization_RequestDenied ⚠️ | Insufficient privileges to complete the operation. |
| Same missing object, servicePrincipals instead of users | `GET /servicePrincipals/2c9e8912-fc71-471d-90c2-a520a1526ad2` | 404 | Request_ResourceNotFound  | Resource '2c9e8912-fc71-471d-90c2-a520a1526ad2' does not exist or one of its queried reference-property objects are not present. |
| Same missing object, directoryRoles instead of users | `GET /directoryRoles/771bc7c8-cdb8-4b52-9e3a-ac7c63c5f1f6` | 403 | Authorization_RequestDenied ⚠️ | Insufficient privileges to complete the operation. |
| A method the collection does not allow | `DELETE /users` | 405 | Request_BadRequest  | Specified HTTP method is not allowed for the request target. |
| Top-level path that is not a Graph resource | `GET /notAResource` | 400 | BadRequest  | Resource not found for the segment 'notAResource'. |
| Request body that is not valid JSON | `POST /users` | 400 | BadRequest  | Unable to read JSON request payload. Please ensure Content-Type header is set and payload is of valid JSON format. |
| Authorization header with a scheme other than Bearer | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Protocol 'Bearer' failed to validate because The token could not be read. |
| Delete an object that is already deleted | `DELETE /users/d68d11c5-97b3-4d0b-afbf-317fdd5e4fe3` | 404 | Request_ResourceNotFound  | Resource 'd68d11c5-97b3-4d0b-afbf-317fdd5e4fe3' does not exist or one of its queried reference-property objects are not present. |
| Same sign-in log read on the beta endpoint | `GET /auditLogs/signIns?$top=1` | 403 | Authentication_MSGraphPermissionMissing  | The principal does not have any one of the required Microsoft Graph permissions: AuditLog.Read.All to call this API. For more information about Microsoft Graph permissions, please visit https://learn. |
| Did the uncounted request actually return @odata.count? | `GET /users?$count=true` | 200 | observation  | see countPresent |
| GET /me with an app-only token | `GET /me` | 400 | BadRequest  | /me request is only valid with delegated authentication flow. |
| GET /me/messages with an app-only token | `GET /me/messages` | 400 | BadRequest  | /me request is only valid with delegated authentication flow. |
| $skip on a directory collection | `GET /users?$skip=1` | 400 | Request_BadRequest  | '$skip' is not supported by the service. |
| $top=0 | `GET /users?$top=0` | 400 | Request_UnsupportedQuery  | Invalid page size specified: '0'. Must be between 1 and 999 inclusive. |
| $filter with the contains operator | `GET /users?$filter=contains(displayName,'lab')` | 400 | Request_UnsupportedQuery  | Filter operator 'Contains' is not supported. |
| $filter and $orderby together without ConsistencyLevel | `GET /users?$filter=startsWith(displayName,'lab')&$orderby=displayName` | 400 | Request_UnsupportedQuery  | Sorting not supported for current query. |
| $orderby on a property that does not support it | `GET /users?$orderby=mailNickname` | 400 | Request_UnsupportedQuery  | Unsupported sort property 'mailNickname' for 'User'. |
| $expand together with advanced query parameters | `GET /users?$count=true&$expand=manager` | 200 | success  |  |
| Create a user with a password the policy rejects | `POST /users` | 400 | Request_BadRequest  | The specified password does not comply with password complexity requirements. Please provide a different password. |
| Create a user whose userPrincipalName domain is not in the tenant | `POST /users` | 400 | Request_BadRequest  | The domain portion of the userPrincipalName property is invalid. You must use one of the verified domain names in your organization. |
| PATCH a read-only property (id) | `PATCH /users/e31c97b7-947b-4418-a0f9-f3f95499cfec` | 204 | success ⚠️ |  |
| PATCH a property that does not exist | `PATCH /users/e31c97b7-947b-4418-a0f9-f3f95499cfec` | 404 | Request_ResourceNotFound ⚠️ | Resource '' does not exist or one of its queried reference-property objects are not present. |
| PATCH a boolean property with a string | `PATCH /users/e31c97b7-947b-4418-a0f9-f3f95499cfec` | 400 | Request_BadRequest  | Cannot convert the literal 'yes' to the expected type 'Edm.Boolean'. |
| A $batch with one good and two failing inner requests | `POST /$batch` | 200 | HTTP 200  | inner results: 1:200, 2:404 Request_ResourceNotFound, 3:403 AccessDenied |
| Burst of up to 400 identical reads, 20 at a time | `GET /users?$top=1 (concurrent)` | 200 | no throttling seen ⚠️ | all 400 requests succeeded |

Objects created for this run were deleted afterwards. No tokens or secrets are recorded.
