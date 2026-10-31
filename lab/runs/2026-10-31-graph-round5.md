Graph error-code lab run 2026-10-31: 52/66 scenarios returned the expected code.

Application permissions in the token used for this run, read from its own `roles` claim: `Application.ReadWrite.OwnedBy`, `User.ReadWrite.All`. Audience `https://graph.microsoft.com`.
`@odata.count` present in the response to `GET /users?$count=true` with no ConsistencyLevel header: false.
`innerError` field sets seen across the error responses: `client-request-id,date,request-id`.

| Scenario | Request | HTTP | Error code | Message (first line) |
|---|---|---|---|---|
| Read sign-in logs on a tenant without a premium licence | `GET /auditLogs/signIns?$top=1` | 403 | Authentication_MSGraphPermissionMissing ⚠️ | The principal does not have any one of the required Microsoft Graph permissions: AuditLog.Read.All to call this API. For more information about Microsoft Graph permissions, please visit https://learn.microsoft.com/graph/permissions-overview. |
| Read directory audit logs without AuditLog.Read.All | `GET /auditLogs/directoryAudits?$top=1` | 403 | Authentication_MSGraphPermissionMissing ⚠️ | The principal does not have any one of the required Microsoft Graph permissions: AuditLog.Read.All to call this API. For more information about Microsoft Graph permissions, please visit https://learn.microsoft.com/graph/permissions-overview. |
| Read Conditional Access policies without Policy.Read.All | `GET /identity/conditionalAccess/policies` | 403 | AccessDenied ⚠️ | You cannot perform the requested operation, required scopes are missing in the token. |
| Write a group without Group.ReadWrite.All | `POST /groups` | 403 | Authorization_RequestDenied  | Insufficient privileges to complete the operation. |
| Token issued for a different audience | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Access token validation failure. Invalid audience. |
| Token with a tampered signature | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Signature is invalid. |
| No Authorization header at all | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Access token is empty. |
| Authorization header present but its bearer value empty | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | UnableToParseTokens |
| Authorization header that is not a JWT | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Protocol 'Bearer' failed to validate because The token could not be read. |
| Count users without the ConsistencyLevel header | `GET /users?$count=true` | 200 | success ⚠️ |  |
| Count users with ConsistencyLevel: eventual (control) | `GET /users?$count=true` | 200 | success  |  |
| Filter on a property that does not exist | `GET /users?$filter=notARealProperty eq 'x'` | 400 | Request_UnsupportedQuery  | Property 'notARealProperty' does not exist as a declared property or extension property. |
| Object ID that is not a GUID | `GET /users/not-a-guid` | 404 | Request_ResourceNotFound  | Resource 'not-a-guid' does not exist or one of its queried reference-property objects are not present. |
| User object that does not exist | `GET /users/b39a4907-bcc6-4fb6-9ffa-af36ce032f14` | 404 | Request_ResourceNotFound  | Resource 'b39a4907-bcc6-4fb6-9ffa-af36ce032f14' does not exist or one of its queried reference-property objects are not present. |
| Path segment that does not exist | `GET /users/does/not/exist` | 400 | Request_BadRequest ⚠️ | Unexpected segment DynamicPathSegment. Expected property/$value. |
| Create a user with no required fields | `POST /users` | 400 | Request_BadRequest  | A password must be specified to create a new user. |
| Create a second user with the same userPrincipalName | `POST /users` | 400 | Request_BadRequest ⚠️ | Another object with the same value for property userPrincipalName already exists. |
| Count users without the ConsistencyLevel header | `GET /users?$count=true` | 200 | success  |  |
| Advanced-query filter (endsWith) without the ConsistencyLevel header | `GET /users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')` | 400 | Request_UnsupportedQuery  | Operator 'endsWith' is not supported because the 'ConsistencyLevel:eventual' header is missing. Refer to https://aka.ms/graph-docs/advanced-queries for more information |
| Advanced-query filter with ConsistencyLevel: eventual (control) | `GET /users?$filter=endsWith(userPrincipalName,'onmicrosoft.com')&$count=true` | 200 | success  |  |
| $search without the ConsistencyLevel header | `GET /users?$search="displayName:lab"` | 400 | Request_UnsupportedQuery  | Request with $search query parameter only works through MSGraph with a special request header: 'ConsistencyLevel: eventual' |
| $top above the page-size limit | `GET /users?$top=5000` | 400 | Request_UnsupportedQuery  | Invalid page size specified: '5000'. Must be between 1 and 999 inclusive. |
| $select naming a property that does not exist | `GET /users?$select=notARealProperty` | 200 | success ⚠️ |  |
| Same missing object, applications instead of users | `GET /applications/66ac0de1-3a49-4425-bf33-581dcd5c3c53` | 404 | Request_ResourceNotFound  | Resource '66ac0de1-3a49-4425-bf33-581dcd5c3c53' does not exist or one of its queried reference-property objects are not present. |
| Same missing object, groups instead of users | `GET /groups/4642f0d2-e936-425a-8c3a-2c08371910e8` | 403 | Authorization_RequestDenied ⚠️ | Insufficient privileges to complete the operation. |
| Same missing object, servicePrincipals instead of users | `GET /servicePrincipals/3d53fe33-acc1-4986-a624-63d240aad9d5` | 404 | Request_ResourceNotFound  | Resource '3d53fe33-acc1-4986-a624-63d240aad9d5' does not exist or one of its queried reference-property objects are not present. |
| Same missing object, directoryRoles instead of users | `GET /directoryRoles/46bc3ca3-d2c6-453e-9308-e025fc72bbf3` | 403 | Authorization_RequestDenied ⚠️ | Insufficient privileges to complete the operation. |
| Same missing object, devices instead of users | `GET /devices/dd5dc1c9-02e3-4ffb-af8f-67cb3c684ded` | 403 | Authorization_RequestDenied  | Insufficient privileges to complete the operation. |
| Same missing object, administrativeUnits instead of users | `GET /directory/administrativeUnits/79914e00-7acd-4191-a022-e5b025534d17` | 403 | Authorization_RequestDenied  | Insufficient privileges to complete the operation. |
| Same missing object, contacts instead of users | `GET /contacts/273f0bd6-1fa9-46cb-911e-b5a2bf6719a5` | 403 | Authorization_RequestDenied  | Insufficient privileges to complete the operation. |
| Same missing object, organization instead of users | `GET /organization/71e24024-db2a-4833-9365-e20ad4b9f2b1` | 400 | Request_BadRequest ⚠️ | Invalid tenant identifier; it must match that of the requested tenant. |
| Collection-level read, groups | `GET /groups?$top=1` | 403 | Authorization_RequestDenied  | Insufficient privileges to complete the operation. |
| Collection-level read, servicePrincipals | `GET /servicePrincipals?$top=1` | 200 | success  |  |
| Collection-level read, applications | `GET /applications?$top=1` | 200 | success  |  |
| Collection-level read, devices | `GET /devices?$top=1` | 403 | Authorization_RequestDenied  | Insufficient privileges to complete the operation. |
| A method the collection does not allow | `DELETE /users` | 405 | Request_BadRequest  | Specified HTTP method is not allowed for the request target. |
| Top-level path that is not a Graph resource | `GET /notAResource` | 400 | BadRequest  | Resource not found for the segment 'notAResource'. |
| Request body that is not valid JSON | `POST /users` | 400 | BadRequest  | Unable to read JSON request payload. Please ensure Content-Type header is set and payload is of valid JSON format. |
| Authorization header with a scheme other than Bearer | `GET /users?$top=1` | 401 | InvalidAuthenticationToken  | Protocol 'Bearer' failed to validate because The token could not be read. |
| Delete an object that is already deleted | `DELETE /users/e795c70d-d313-45d0-a2dc-83771fa5be69` | 404 | Request_ResourceNotFound  | Resource 'e795c70d-d313-45d0-a2dc-83771fa5be69' does not exist or one of its queried reference-property objects are not present. |
| Same sign-in log read on the beta endpoint | `GET /auditLogs/signIns?$top=1` | 403 | Authentication_MSGraphPermissionMissing  | The principal does not have any one of the required Microsoft Graph permissions: AuditLog.Read.All to call this API. For more information about Microsoft Graph permissions, please visit https://learn.microsoft.com/graph/permissions-overview. |
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
| PATCH a read-only property (id) | `PATCH /users/f4a535f1-f72a-45bf-bad9-eb5d013a9da6` | 204 | success ⚠️ |  |
| PATCH a property that does not exist | `PATCH /users/f4a535f1-f72a-45bf-bad9-eb5d013a9da6` | 404 | Request_ResourceNotFound ⚠️ | Resource '' does not exist or one of its queried reference-property objects are not present. |
| PATCH a boolean property with a string | `PATCH /users/f4a535f1-f72a-45bf-bad9-eb5d013a9da6` | 400 | Request_BadRequest  | Cannot convert the literal 'yes' to the expected type 'Edm.Boolean'. |
| A $batch with one good and two failing inner requests | `POST /$batch` | 200 | HTTP 200  | inner results: 1:200, 2:404 Request_ResourceNotFound, 3:403 AccessDenied |
| Control: $count=true WITH ConsistencyLevel eventual | `GET /users?$count=true` | 200 | success  |  |
| Control: was @odata.count present WITH the header? | `GET /users?$count=true + ConsistencyLevel` | 200 | observation  | @odata.count present: true |
| Fix for "Sorting not supported": add the header and $count | `GET /users?$filter=startsWith(displayName,'lab')&$orderby=displayName&$count=true` | 200 | success  |  |
| Fix for $search: add the header | `GET /users?$search="displayName:lab"` | 200 | success  |  |
| Fix for contains: use startsWith instead | `GET /users?$filter=startsWith(displayName,'lab')` | 200 | success  |  |
| Fix for $skip: page without it | `GET /users?$top=1` | 200 | success  |  |
| Fix for /me with an app-only token: GET /users/<id> | `GET /users/5e5942c2-1d83-4221-bf13-0065abec7401` | 200 | success  |  |
| Does a PATCH of a read-only property actually change it? | `PATCH /users/5e5942c2-1d83-4221-bf13-0065abec7401` | 204 | success  |  |
| After that PATCH, is the id unchanged? | `GET /users/<id>?$select=id` | 200 | observation  | id unchanged: true |
| Burst of up to 400 identical reads, 20 at a time | `GET /users?$top=1 (concurrent)` | 200 | no throttling seen ⚠️ | all 400 requests succeeded |

Objects created for this run were deleted afterwards. No tokens or secrets are recorded.
