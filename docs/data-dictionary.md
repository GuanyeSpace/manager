# 数据字段速查（schema 快照）

核对日期：2026-10-01（本次更新User及账号中控可空字段）；从当前 prisma/schema.prisma 提取。此文档便于查字段，不替代源码；变更 schema 时须同步本表。SQL 专属索引/检查约束仍须查看迁移。JSON 内部结构、业务含义和单位见 [数据模型](data-model.md) 与 [业务规则](business-rules.md)。

`?` 为可空，`[]` 为数组或关联集合。关联对象字段不是独立数据库列；其外键字段另列。约束列保留 Prisma 定义，不包含真实数据库内容。

## Role（enum）

| 值 | schema 注释 |
| --- | --- |
| `BOSS` | 老板 |
| `OPERATOR` | 运营 |
| `CONTROLLER` | 直播中控 |
| `LEAD_SPECIALIST` | 导粉专员 |
| `ASSISTANT` | 小助理 |
| `ANCHOR` | 主播 |
| `FINANCE` | 财务 |

## EmploymentStatus（enum）

| 值 | schema 注释 |
| --- | --- |
| `ACTIVE` | — |
| `RESIGNED` | — |

## BranchStatus（enum）

| 值 | schema 注释 |
| --- | --- |
| `ACTIVE` | — |
| `INACTIVE` | — |

## AuditAction（enum）

| 值 | schema 注释 |
| --- | --- |
| `LOGIN_SUCCESS` | — |
| `LOGIN_FAIL` | — |
| `USER_CREATE` | — |
| `USER_UPDATE` | — |
| `USER_RESIGN` | — |
| `USER_REACTIVATE` | — |
| `PASSWORD_RESET` | 老板给别人重置密码 |
| `PASSWORD_CHANGE` | 本人修改自己的密码 |
| `BRANCH_CREATE` | — |
| `BRANCH_UPDATE` | — |
| `ACCOUNT_CREATE` | — |
| `ACCOUNT_UPDATE` | — |
| `LIVE_REPORT_CREATE` | — |
| `LIVE_REPORT_UPDATE` | — |
| `WORKFLOW_UPDATE` | — |
| `WORK_SESSION_UPDATE` | — |
| `DAILY_WORK_UPDATE` | — |
| `RESOURCE_CREATE` | — |
| `RESOURCE_UPDATE` | — |

## Branch（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `phoneLogins` | `PhoneAccountLogin[]` | 关联对象 | — | — |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `name` | `String` | 存储字段 | `@unique` | — |
| `status` | `BranchStatus` | 存储字段 | `@default(ACTIVE)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `users` | `User[]` | 关联对象 | — | — |
| `managerId` | `String?` | 存储字段 | — | — |
| `manager` | `User?` | 关联对象 | `@relation("BranchManager", fields: [managerId], references: [id], onDelete: Restrict)` | — |
| `accounts` | `DouyinAccount[]` | 关联对象 | — | — |
| `leadTasks` | `LeadTask[]` | 关联对象 | — | — |
| `liveReports` | `LiveReport[]` | 关联对象 | — | — |
| `accountRecords` | `AccountRecord[]` | 关联对象 | — | — |
| `liveRooms` | `LiveRoom[]` | 关联对象 | — | — |
| `phoneNumbers` | `PhoneNumber[]` | 关联对象 | — | — |
| `devices` | `AssetDevice[]` | 关联对象 | — | — |
| `roomAnchors` | `RoomAnchor[]` | 关联对象 | — | — |
| `deviceSlots` | `DeviceSlot[]` | 关联对象 | — | — |

模型级约束：

- `@@index([managerId])`

## User（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `username` | `String` | 存储字段 | `@unique` | — |
| `name` | `String` | 存储字段 | — | — |
| `nickname` | `String` | 存储列 | `@default("")` | 本人昵称，不覆盖姓名 |
| `contactPhone` | `String` | 存储列 | `@default("")` | 本人联系电话 |
| `profileVersion` | `Int` | 存储列 | `@default(0)` | 个人资料并发版本 |
| `passwordHash` | `String` | 存储字段 | — | — |
| `role` | `Role` | 存储字段 | — | — |
| `roles` | `Role[]` | 存储字段 | `@default([])` | 兼任岗位，原岗位保留 |
| `branchId` | `String?` | 存储字段 | — | — |
| `branch` | `Branch?` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `employmentStatus` | `EmploymentStatus` | 存储字段 | `@default(ACTIVE)` | — |
| `mustChangePassword` | `Boolean` | 存储字段 | `@default(true)` | — |
| `lastLoginAt` | `DateTime?` | 存储字段 | — | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |
| `managedBranches` | `Branch[]` | 关联对象 | `@relation("BranchManager")` | — |
| `operatedAccounts` | `DouyinAccount[]` | 关联对象 | `@relation("AccountOperator")` | — |
| `controlledAccounts` | `DouyinAccount[]` | 关联对象 | `@relation("AccountController")` | — |
| `anchoredAccounts` | `DouyinAccount[]` | 关联对象 | `@relation("AccountAnchor")` | — |
| `operatedRooms` | `LiveRoom[]` | 关联对象 | `@relation("RoomOperator")` | — |
| `controlledRooms` | `LiveRoom[]` | 关联对象 | `@relation("RoomController")` | — |
| `roomAnchors` | `RoomAnchor[]` | 关联对象 | — | — |
| `operatedNumbers` | `PhoneNumber[]` | 关联对象 | `@relation("NumberOperator")` | — |
| `controlledNumbers` | `PhoneNumber[]` | 关联对象 | `@relation("NumberController")` | — |
| `usedNumbers` | `PhoneNumber[]` | 关联对象 | `@relation("NumberUser")` | — |
| `operatedDevices` | `AssetDevice[]` | 关联对象 | `@relation("DeviceOperator")` | — |
| `controlledDevices` | `AssetDevice[]` | 关联对象 | `@relation("DeviceController")` | — |
| `usedDevices` | `AssetDevice[]` | 关联对象 | `@relation("DeviceUser")` | — |
| `leadTasks` | `LeadTask[]` | 关联对象 | — | — |
| `sessions` | `Session[]` | 关联对象 | — | — |
| `auditLogs` | `AuditLog[]` | 关联对象 | `@relation("ActorLogs")` | — |

模型级约束：

- `@@index([branchId])`
- `@@index([employmentStatus])`
- `@@index([role])`

## Session（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id` | 会话 token，登录时用加密随机数生成 |
| `userId` | `String` | 存储字段 | — | — |
| `user` | `User` | 关联对象 | `@relation(fields: [userId], references: [id], onDelete: Cascade)` | — |
| `expiresAt` | `DateTime` | 存储字段 | — | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |

模型级约束：

- `@@index([userId])`

## AuditLog（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `actorId` | `String?` | 存储字段 | — | 操作人；系统动作（如登录失败）可为空 |
| `actor` | `User?` | 关联对象 | `@relation("ActorLogs", fields: [actorId], references: [id], onDelete: SetNull)` | — |
| `action` | `AuditAction` | 存储字段 | — | — |
| `targetType` | `String` | 存储字段 | — | 如 "User"、"Branch" |
| `targetId` | `String?` | 存储字段 | — | — |
| `detail` | `Json?` | 存储字段 | — | — |
| `ip` | `String?` | 存储字段 | — | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |

模型级约束：

- `@@index([createdAt])`
- `@@index([actorId])`

## DouyinAccount（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `phoneLogins` | `PhoneAccountLogin[]` | 关联对象 | — | — |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `douyinId` | `String` | 存储字段 | `@unique` | — |
| `name` | `String` | 存储字段 | — | — |
| `homepageUrl` | `String` | 存储字段 | — | — |
| `realName` | `String` | 存储字段 | — | — |
| `phone` | `String` | 存储字段 | — | — |
| `phoneNumberId` | `String?` | 存储字段 | `@unique` | — |
| `phoneNumber` | `PhoneNumber?` | 关联对象 | `@relation(fields: [phoneNumberId], references: [id], onDelete: Restrict)` | — |
| `roomId` | `String?` | 存储字段 | — | — |
| `room` | `LiveRoom?` | 关联对象 | `@relation(fields: [roomId], references: [id], onDelete: Restrict)` | — |
| `purpose` | `String` | 存储字段 | — | — |
| `notes` | `String` | 存储字段 | — | — |
| `active` | `Boolean` | 存储字段 | `@default(true)` | — |
| `banned` | `Boolean` | 存储字段 | `@default(false)` | 封禁标记；为true时active必须false |
| `unbanDate` | `String?` | 存储字段 | — | YYYY-MM-DD预计解封日期；未知为null，不自动解封 |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `operatorId` | `String?` | 存储字段 | — | — |
| `operator` | `User?` | 关联对象 | `@relation("AccountOperator", fields: [operatorId], references: [id], onDelete: Restrict)` | — |
| `controllerId` | `String?` | 存储字段 | — | — |
| `controller` | `User?` | 关联对象 | `@relation("AccountController", fields: [controllerId], references: [id], onDelete: Restrict)` | — |
| `anchorId` | `String?` | 存储字段 | — | — |
| `anchor` | `User?` | 关联对象 | `@relation("AccountAnchor", fields: [anchorId], references: [id], onDelete: Restrict)` | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |
| `liveReports` | `LiveReport[]` | 关联对象 | — | — |
| `records` | `AccountRecord[]` | 关联对象 | — | — |
| `workflow` | `AccountWorkflow?` | 关联对象 | — | — |
| `workSessions` | `WorkSession[]` | 关联对象 | — | — |

模型级约束：

- `@@index([branchId])`
- `@@index([operatorId])`
- `@@index([controllerId])`
- `@@index([anchorId])`

## AccountRecord（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `accountId` | `String` | 存储字段 | — | — |
| `account` | `DouyinAccount` | 关联对象 | `@relation(fields: [accountId], references: [id], onDelete: Restrict)` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `branchName` | `String` | 存储字段 | — | — |
| `douyinId` | `String` | 存储字段 | — | — |
| `name` | `String` | 存储字段 | — | — |
| `active` | `Boolean` | 存储字段 | — | — |
| `banned` | `Boolean` | 存储字段 | `@default(false)` | 封禁标记；为true时active必须false |
| `unbanDate` | `String?` | 存储字段 | — | YYYY-MM-DD预计解封日期；未知为null，不自动解封 |
| `operatorId` | `String?` | 存储字段 | — | — |
| `operatorName` | `String?` | 存储字段 | — | — |
| `controllerId` | `String?` | 存储字段 | — | — |
| `controllerName` | `String?` | 存储字段 | — | — |
| `anchorId` | `String?` | 存储字段 | — | — |
| `anchorName` | `String?` | 存储字段 | — | — |
| `actorName` | `String` | 存储字段 | — | — |
| `version` | `Int` | 存储字段 | — | — |
| `startedAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `endedAt` | `DateTime?` | 存储字段 | — | — |
| `liveReports` | `LiveReport[]` | 关联对象 | — | — |
| `workSessions` | `WorkSession[]` | 关联对象 | — | — |

模型级约束：

- `@@unique([accountId, version])`
- `@@index([branchId])`
- `@@index([operatorId])`
- `@@index([controllerId])`
- `@@index([anchorId])`

## LiveReport（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `accountId` | `String` | 存储字段 | — | — |
| `account` | `DouyinAccount` | 关联对象 | `@relation(fields: [accountId], references: [id], onDelete: Restrict)` | — |
| `sourceRecordId` | `String` | 存储字段 | — | — |
| `sourceRecord` | `AccountRecord` | 关联对象 | `@relation(fields: [sourceRecordId], references: [id], onDelete: Restrict)` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `branchName` | `String` | 存储字段 | — | — |
| `accountName` | `String` | 存储字段 | — | — |
| `douyinId` | `String` | 存储字段 | — | — |
| `controllerId` | `String?` | 存储字段 | — | — |
| `controllerName` | `String?` | 存储字段 | — | — |
| `operatorId` | `String?` | 存储字段 | — | — |
| `anchorId` | `String?` | 存储字段 | — | — |
| `createdById` | `String` | 存储字段 | — | — |
| `createdByName` | `String` | 存储字段 | — | — |
| `updatedByName` | `String` | 存储字段 | — | — |
| `startedAt` | `DateTime` | 存储字段 | — | — |
| `durationSeconds` | `Int` | 存储字段 | — | — |
| `sessionLabel` | `String` | 存储字段 | — | — |
| `exposureCount` | `Int` | 存储字段 | — | — |
| `entryCount` | `Int` | 存储字段 | — | — |
| `averageOnline` | `Int` | 存储字段 | — | — |
| `peakOnline` | `Int` | 存储字段 | — | — |
| `averageStayHundredths` | `Int` | 存储字段 | — | — |
| `commenterCount` | `Int` | 存储字段 | — | — |
| `likeCount` | `Int` | 存储字段 | — | — |
| `newFollowers` | `Int` | 存储字段 | — | — |
| `shareCount` | `Int` | 存储字段 | — | — |
| `newFanClubMembers` | `Int` | 存储字段 | — | — |
| `fanGroupCount` | `Int?` | 存储字段 | — | — |
| `linkClickCount` | `Int?` | 存储字段 | — | — |
| `longPressCount` | `Int?` | 存储字段 | — | — |
| `backendJoinCount` | `Int?` | 存储字段 | — | — |
| `effectiveCount` | `Int?` | 存储字段 | — | — |
| `hasSales` | `Boolean?` | 存储字段 | — | — |
| `salesGmv` | `Decimal?` | 存储字段 | `@db.Decimal(14, 2)` | — |
| `deletedAt` | `DateTime?` | 存储字段 | — | — |
| `monetizationDeletedAt` | `DateTime?` | 存储字段 | — | — |
| `monetizationUpdatedAt` | `DateTime?` | 存储字段 | — | — |
| `monetizationUpdatedBy` | `String?` | 存储字段 | — | — |
| `workSessionId` | `String?` | 存储字段 | `@unique` | — |
| `workSession` | `WorkSession?` | 关联对象 | `@relation(fields: [workSessionId], references: [id], onDelete: Restrict)` | — |
| `historicalBackfill` | `Boolean` | 存储字段 | `@default(false)` | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |

模型级约束：

- `@@unique([accountId, startedAt])`
- `@@index([branchId, startedAt])`
- `@@index([controllerId])`
- `@@index([operatorId])`
- `@@index([anchorId])`

## AccountWorkflow（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `accountId` | `String` | 存储字段 | `@id` | — |
| `account` | `DouyinAccount` | 关联对象 | `@relation(fields: [accountId], references: [id], onDelete: Restrict)` | — |
| `content` | `Json` | 存储字段 | — | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `updatedByName` | `String` | 存储字段 | — | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |

## WorkPhase（enum）

| 值 | schema 注释 |
| --- | --- |
| `PREPARING` | — |
| `LIVE` | — |
| `WRAP` | — |
| `COMPLETE` | — |
| `CANCELLED` | — |

## WorkSession（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `accountId` | `String` | 存储字段 | — | — |
| `account` | `DouyinAccount` | 关联对象 | `@relation(fields: [accountId], references: [id], onDelete: Restrict)` | — |
| `sourceRecordId` | `String` | 存储字段 | — | — |
| `sourceRecord` | `AccountRecord` | 关联对象 | `@relation(fields: [sourceRecordId], references: [id], onDelete: Restrict)` | — |
| `controllerId` | `String` | 存储字段 | — | — |
| `shiftId` | `String?` | 存储字段 | — | — |
| `shift` | `WorkShift?` | 关联对象 | `@relation(fields: [shiftId], references: [id], onDelete: Restrict)` | — |
| `loginUserId` | `String?` | 存储字段 | — | — |
| `loginUserName` | `String?` | 存储字段 | — | — |
| `actualControllerId` | `String?` | 存储字段 | — | — |
| `actualControllerName` | `String?` | 存储字段 | — | — |
| `label` | `String` | 存储字段 | — | — |
| `phase` | `WorkPhase` | 存储字段 | `@default(PREPARING)` | — |
| `workflow` | `Json` | 存储字段 | — | — |
| `workflowVersion` | `Int` | 存储字段 | — | — |
| `progress` | `Json` | 存储字段 | `@default("{}")` | — |
| `hasViolation` | `Boolean?` | 存储字段 | — | — |
| `violationDetail` | `String` | 存储字段 | `@default("")` | — |
| `outcome` | `String?` | 存储字段 | — | — |
| `hasIncident` | `Boolean?` | 存储字段 | — | — |
| `wrapNote` | `String?` | 存储字段 | — | — |
| `startedAt` | `DateTime?` | 存储字段 | — | — |
| `endedAt` | `DateTime?` | 存储字段 | — | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `events` | `WorkEvent[]` | 关联对象 | — | — |
| `report` | `LiveReport?` | 关联对象 | — | — |
| `screenshots` | `WorkScreenshot[]` | 关联对象 | — | — |
| `leadEligible` | `Boolean` | 存储字段 | `@default(true)` | — |
| `leadTask` | `LeadTask?` | 关联对象 | — | — |

模型级约束：

- `@@index([accountId, createdAt])`
- `@@index([controllerId, phase])`
- `@@index([shiftId])`
- `@@index([loginUserId, phase])`
- `@@index([actualControllerId, phase])`

## WorkEvent（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `sessionId` | `String` | 存储字段 | — | — |
| `session` | `WorkSession` | 关联对象 | `@relation(fields: [sessionId], references: [id], onDelete: Restrict)` | — |
| `kind` | `String` | 存储字段 | — | — |
| `body` | `String` | 存储字段 | — | — |
| `actorId` | `String` | 存储字段 | — | — |
| `actorName` | `String` | 存储字段 | — | — |
| `screenshots` | `WorkScreenshot[]` | 关联对象 | — | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |

模型级约束：

- `@@index([sessionId, createdAt])`

## DailyWork（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `userId` | `String` | 存储字段 | — | — |
| `day` | `String` | 存储字段 | — | — |
| `checks` | `Json` | 存储字段 | `@default("{}")` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |

模型级约束：

- `@@unique([userId, day])`

## LiveRoom（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `name` | `String` | 存储字段 | — | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `operatorId` | `String?` | 存储字段 | — | — |
| `operator` | `User?` | 关联对象 | `@relation("RoomOperator", fields: [operatorId], references: [id], onDelete: Restrict)` | — |
| `controllerId` | `String?` | 存储字段 | — | — |
| `controller` | `User?` | 关联对象 | `@relation("RoomController", fields: [controllerId], references: [id], onDelete: Restrict)` | — |
| `location` | `String` | 存储字段 | `@default("")` | — |
| `notes` | `String` | 存储字段 | `@default("")` | — |
| `active` | `Boolean` | 存储字段 | `@default(true)` | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |
| `anchors` | `RoomAnchor[]` | 关联对象 | — | — |
| `accounts` | `DouyinAccount[]` | 关联对象 | — | — |
| `numbers` | `PhoneNumber[]` | 关联对象 | — | — |
| `devices` | `AssetDevice[]` | 关联对象 | — | — |

模型级约束：

- `@@unique([branchId, name])`
- `@@index([operatorId])`
- `@@index([controllerId])`

## RoomAnchor（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `roomId` | `String` | 存储字段 | — | — |
| `room` | `LiveRoom` | 关联对象 | `@relation(fields: [roomId], references: [id], onDelete: Restrict)` | — |
| `userId` | `String` | 存储字段 | — | — |
| `user` | `User` | 关联对象 | `@relation(fields: [userId], references: [id], onDelete: Restrict)` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |

模型级约束：

- `@@id([roomId, userId])`
- `@@index([userId])`
- `@@index([branchId])`

## PhoneNumber（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `number` | `String` | 存储字段 | `@unique` | — |
| `openedBy` | `String` | 存储字段 | `@default("")` | — |
| `wechat` | `String` | 存储字段 | `@default("")` | — |
| `xiaohongshu` | `String` | 存储字段 | `@default("")` | — |
| `kuaishou` | `String` | 存储字段 | `@default("")` | — |
| `monthlyFeeCents` | `Int?` | 存储字段 | — | — |
| `dataGb` | `Decimal?` | 存储字段 | `@db.Decimal(10, 2)` | — |
| `cardType` | `String?` | 存储字段 | — | — |
| `mainCardId` | `String?` | 存储字段 | — | — |
| `mainCard` | `PhoneNumber?` | 关联对象 | `@relation("NumberPlan", fields: [mainCardId], references: [id], onDelete: Restrict)` | — |
| `secondaryCards` | `PhoneNumber[]` | 关联对象 | `@relation("NumberPlan")` | — |
| `status` | `String?` | 存储字段 | — | — |
| `otherPhone` | `String` | 存储字段 | `@default("")` | — |
| `carrier` | `String` | 存储字段 | `@default("")` | — |
| `plan` | `String` | 存储字段 | `@default("")` | — |
| `purpose` | `String` | 存储字段 | `@default("")` | — |
| `notes` | `String` | 存储字段 | `@default("")` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `roomId` | `String?` | 存储字段 | — | — |
| `room` | `LiveRoom?` | 关联对象 | `@relation(fields: [roomId], references: [id], onDelete: Restrict)` | — |
| `operatorId` | `String?` | 存储字段 | — | — |
| `operator` | `User?` | 关联对象 | `@relation("NumberOperator", fields: [operatorId], references: [id], onDelete: Restrict)` | — |
| `controllerId` | `String?` | 存储字段 | — | — |
| `controller` | `User?` | 关联对象 | `@relation("NumberController", fields: [controllerId], references: [id], onDelete: Restrict)` | — |
| `userId` | `String?` | 存储字段 | — | — |
| `user` | `User?` | 关联对象 | `@relation("NumberUser", fields: [userId], references: [id], onDelete: Restrict)` | — |
| `active` | `Boolean` | 存储字段 | `@default(true)` | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |
| `account` | `DouyinAccount?` | 关联对象 | — | — |
| `slot` | `DeviceSlot?` | 关联对象 | — | — |

模型级约束：

- `@@index([mainCardId])`
- `@@index([branchId, status])`
- `@@index([branchId])`
- `@@index([roomId])`
- `@@index([operatorId])`
- `@@index([controllerId])`
- `@@index([userId])`

## DeviceKind（enum）

| 值 | schema 注释 |
| --- | --- |
| `PHONE` | — |
| `EQUIPMENT` | — |
| `MATERIAL` | — |

## PhoneAccountLogin（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `deviceId` | `String` | 存储字段 | — | — |
| `device` | `AssetDevice` | 关联对象 | `@relation(fields: [deviceId], references: [id], onDelete: Restrict)` | — |
| `accountId` | `String` | 存储字段 | — | — |
| `account` | `DouyinAccount` | 关联对象 | `@relation(fields: [accountId], references: [id], onDelete: Restrict)` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |

模型级约束：

- `@@id([deviceId, accountId])`
- `@@index([accountId])`
- `@@index([branchId])`

## AssetDevice（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `loginWechats` | `String` | 存储字段 | `@default("")` | — |
| `phoneLogins` | `PhoneAccountLogin[]` | 关联对象 | — | — |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `kind` | `DeviceKind` | 存储字段 | — | — |
| `individual` | `Boolean` | 存储字段 | `@default(false)` | — |
| `splitAt` | `DateTime?` | 存储字段 | — | — |
| `sourceAssetId` | `String?` | 存储字段 | — | — |
| `sourceAsset` | `AssetDevice?` | 关联对象 | `@relation("AssetSplit", fields: [sourceAssetId], references: [id], onDelete: Restrict)` | — |
| `splitItems` | `AssetDevice[]` | 关联对象 | `@relation("AssetSplit")` | — |
| `code` | `String` | 存储字段 | `@unique` | — |
| `model` | `String` | 存储字段 | — | — |
| `category` | `String` | 存储字段 | `@default("")` | — |
| `serialNumber` | `String` | 存储字段 | `@default("")` | — |
| `quantity` | `Int?` | 存储字段 | — | — |
| `unit` | `String` | 存储字段 | `@default("件")` | — |
| `purchaseDate` | `String` | 存储字段 | `@default("")` | — |
| `purchaseUnitPriceCents` | `Int?` | 存储字段 | — | — |
| `currentUnitValueCents` | `Int?` | 存储字段 | — | — |
| `purpose` | `String` | 存储字段 | `@default("")` | — |
| `notes` | `String` | 存储字段 | `@default("")` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `roomId` | `String?` | 存储字段 | — | — |
| `room` | `LiveRoom?` | 关联对象 | `@relation(fields: [roomId], references: [id], onDelete: Restrict)` | — |
| `operatorId` | `String?` | 存储字段 | — | — |
| `operator` | `User?` | 关联对象 | `@relation("DeviceOperator", fields: [operatorId], references: [id], onDelete: Restrict)` | — |
| `controllerId` | `String?` | 存储字段 | — | — |
| `controller` | `User?` | 关联对象 | `@relation("DeviceController", fields: [controllerId], references: [id], onDelete: Restrict)` | — |
| `userId` | `String?` | 存储字段 | — | — |
| `user` | `User?` | 关联对象 | `@relation("DeviceUser", fields: [userId], references: [id], onDelete: Restrict)` | — |
| `active` | `Boolean` | 存储字段 | `@default(true)` | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |
| `slots` | `DeviceSlot[]` | 关联对象 | — | — |

模型级约束：

- `@@index([sourceAssetId])`
- `@@index([branchId, kind])`
- `@@index([roomId])`
- `@@index([operatorId])`
- `@@index([controllerId])`
- `@@index([userId])`

## DeviceSlot（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `deviceId` | `String` | 存储字段 | — | — |
| `device` | `AssetDevice` | 关联对象 | `@relation(fields: [deviceId], references: [id], onDelete: Restrict)` | — |
| `slot` | `Int` | 存储字段 | — | — |
| `phoneNumberId` | `String` | 存储字段 | `@unique` | — |
| `phoneNumber` | `PhoneNumber` | 关联对象 | `@relation(fields: [phoneNumberId], references: [id], onDelete: Restrict)` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |

模型级约束：

- `@@id([deviceId, slot])`
- `@@index([branchId])`

## WorkShift（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `userId` | `String` | 存储字段 | — | — |
| `userName` | `String` | 存储字段 | — | — |
| `branchId` | `String?` | 存储字段 | — | — |
| `startedAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `clockStartedAt` | `DateTime?` | 存储字段 | 可空；新记录服务器写入 | 不随登记时间更正；旧行fallback createdAt |
| `checkedInAt` | `DateTime?` | 存储字段 | 可空 | 首次四项完成；历史不补造 |
| `earlyEndReason` | `String?` | 存储字段 | 可空 | 提前下班必填；更正保留 |
| `endedAt` | `DateTime?` | 存储字段 | — | — |
| `checks` | `Json` | 存储字段 | `@default("{}")` | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |
| `sessions` | `WorkSession[]` | 关联对象 | — | — |

模型级约束：

- `@@index([userId, startedAt])`
- `@@index([branchId])`

## WorkScreenshot（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `sessionId` | `String` | 存储字段 | — | — |
| `session` | `WorkSession` | 关联对象 | `@relation(fields: [sessionId], references: [id], onDelete: Restrict)` | — |
| `eventId` | `String` | 存储字段 | — | — |
| `event` | `WorkEvent` | 关联对象 | `@relation(fields: [eventId], references: [id], onDelete: Restrict)` | — |
| `contentType` | `String` | 存储字段 | — | — |
| `size` | `Int` | 存储字段 | — | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |

模型级约束：

- `@@index([sessionId, createdAt])`
- `@@index([eventId])`
- `@@index([branchId])`

## LeadTask（model）

| 字段 | 类型 | 种类 | 约束/默认 | schema 注释 |
| --- | --- | --- | --- | --- |
| `id` | `String` | 存储字段 | `@id @default(cuid())` | — |
| `sessionId` | `String` | 存储字段 | `@unique` | — |
| `session` | `WorkSession` | 关联对象 | `@relation(fields: [sessionId], references: [id], onDelete: Restrict)` | — |
| `branchId` | `String` | 存储字段 | — | — |
| `branch` | `Branch` | 关联对象 | `@relation(fields: [branchId], references: [id], onDelete: Restrict)` | — |
| `userId` | `String` | 存储字段 | — | — |
| `user` | `User` | 关联对象 | `@relation(fields: [userId], references: [id], onDelete: Restrict)` | — |
| `userName` | `String` | 存储字段 | — | — |
| `data` | `Json` | 存储字段 | `@default("{}")` | — |
| `completedAt` | `DateTime?` | 存储字段 | — | — |
| `deletedAt` | `DateTime?` | 存储字段 | — | — |
| `version` | `Int` | 存储字段 | `@default(1)` | — |
| `createdAt` | `DateTime` | 存储字段 | `@default(now())` | — |
| `updatedAt` | `DateTime` | 存储字段 | `@updatedAt` | — |

模型级约束：

- `@@index([branchId, createdAt])`
- `@@index([userId, completedAt])`
