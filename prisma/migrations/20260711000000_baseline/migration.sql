-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountDocType" AS ENUM ('QUOTATION', 'INVOICE', 'RECEIPT', 'TAX_INVOICE', 'TAX_INVOICE_ABB', 'DEPOSIT_RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'BILLING_NOTE', 'PURCHASE', 'EXPENSE', 'PURCHASE_ORDER', 'ASSET_PURCHASE_ORDER', 'ASSET_PURCHASE', 'PURCHASE_TAX_INVOICE', 'DEPOSIT_PAYMENT', 'CREDIT_NOTE_RECEIVED', 'DEBIT_NOTE_RECEIVED', 'COMBINED_PAYMENT', 'GOODS_ISSUE', 'GOODS_ISSUE_RETURN', 'WHT_CERT');

-- CreateEnum
CREATE TYPE "AccountDocStatus" AS ENUM ('DRAFT', 'AWAITING_ACCEPT', 'ACCEPTED', 'REJECTED', 'AWAITING_APPROVAL', 'APPROVED', 'AWAITING_PAYMENT', 'PARTIAL', 'PAID', 'AWAITING_DEDUCT', 'DEDUCTED', 'AWAITING_RECEIVE', 'RECEIVED', 'ISSUED', 'VOIDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountVatMode" AS ENUM ('INCLUDE', 'EXCLUDE', 'NONE');

-- CreateEnum
CREATE TYPE "AccountDocDirection" AS ENUM ('IN', 'OUT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "AccountRelationType" AS ENUM ('CONVERT', 'DEPOSIT_APPLY', 'ADJUST', 'BILL', 'PAY_GROUP', 'TAX_FOR', 'REPLACE');

-- CreateEnum
CREATE TYPE "AccountPayChannel" AS ENUM ('CASH', 'TRANSFER', 'PROMPTPAY', 'CARD', 'E_WALLET', 'CHEQUE', 'DEPOSIT_APPLY', 'CREDIT_APPLY', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountContactKind" AS ENUM ('CUSTOMER', 'VENDOR', 'BOTH');

-- CreateEnum
CREATE TYPE "AccountLegalType" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "AccountVatTiming" AS ENUM ('ON_ISSUE', 'ON_PAYMENT');

-- CreateEnum
CREATE TYPE "AccountProductType" AS ENUM ('GOODS', 'SERVICE');

-- CreateEnum
CREATE TYPE "AccountFinanceType" AS ENUM ('CASH', 'BANK', 'E_WALLET', 'PETTY_CASH');

-- CreateEnum
CREATE TYPE "AccountChequeDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "AccountChequeStatus" AS ENUM ('ON_HAND', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'ISSUED', 'VOIDED');

-- CreateEnum
CREATE TYPE "AccountLedgerType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'COGS', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountCashflowActivity" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING', 'NONE');

-- CreateEnum
CREATE TYPE "AccountJournalBook" AS ENUM ('SALES', 'PURCHASES', 'RECEIPTS', 'PAYMENTS', 'GENERAL');

-- CreateEnum
CREATE TYPE "AccountJournalType" AS ENUM ('DOC', 'PAYMENT', 'ADJUST', 'REVERSAL', 'DEPRECIATION', 'OPENING');

-- CreateEnum
CREATE TYPE "AccountEntrySource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "AccountEntryStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AccountPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountAssetStatus" AS ENUM ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "AccountWhtIncomeType" AS ENUM ('M40_1', 'M40_2', 'M40_3', 'M40_4', 'M40_5', 'M40_6', 'M40_7', 'M40_8');

-- CreateEnum
CREATE TYPE "AccountEtaxStatus" AS ENUM ('NOT_SENT', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AccountLinkedKind" AS ENUM ('POS', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SystemType" AS ENUM ('MEMBER', 'POINT', 'POS', 'REWARD', 'COUPON', 'MEETING', 'KANBAN', 'ACCOUNT', 'CHAT');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ARRIVED', 'DONE', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChatChannelType" AS ENUM ('WEBCHAT', 'LINE', 'FACEBOOK', 'INSTAGRAM', 'SHOPEE', 'LAZADA', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ChatConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "ChatConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ChatMessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'STICKER', 'FILE', 'ORDER_CONTEXT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ChatDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatEventType" AS ENUM ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'UNIT_CHANGED', 'CUSTOMER_LINKED', 'REOPENED', 'DELIVERY_FAILED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING_DELETE');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('NONE', 'PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('HOTEL', 'RESTAURANT', 'BOOKING', 'QUEUE', 'TICKET', 'SHOP');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "AuthPurpose" AS ENUM ('MAGIC_LINK', 'OTP');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'FINANCE');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'PLATFORM_USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "HotelRoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'OOO');

-- CreateEnum
CREATE TYPE "HotelReservationStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KanbanEntityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MeetingChannelKind" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MemberTier" AS ENUM ('MEMBER', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "PointTxType" AS ENUM ('EARN', 'BURN', 'ADJUST', 'REVERSE', 'EXPIRE');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('PAID', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PosPayType" AS ENUM ('CASH', 'TRANSFER', 'PROMPTPAY', 'DEPOSIT', 'ROOM_CHARGE');

-- CreateEnum
CREATE TYPE "QueueTypeStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QueueCounterStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QueueTicketStatus" AS ENUM ('WAITING', 'CALLED', 'SERVING', 'DONE', 'SKIPPED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QueueIssueChannel" AS ENUM ('KIOSK', 'ONLINE', 'STAFF', 'BOOKING');

-- CreateEnum
CREATE TYPE "RestOrderType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "RestOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KdsItemStatus" AS ENUM ('NEW', 'COOKING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'MERGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('RECT', 'ROUND');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('CALL_STAFF', 'REQUEST_BILL');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'ACKED', 'DONE');

-- CreateEnum
CREATE TYPE "MenuItemStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('AWAITING_CONFIRM', 'ACCEPTED', 'READY', 'PICKED_UP', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "RewardRedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketAdmissionStatus" AS ENUM ('VALID', 'CHECKED_IN', 'VOID');

-- CreateTable
CREATE TABLE "AccountDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "docType" "AccountDocType" NOT NULL,
    "docNo" TEXT,
    "status" "AccountDocStatus" NOT NULL DEFAULT 'DRAFT',
    "direction" "AccountDocDirection" NOT NULL DEFAULT 'OUT',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "contactId" TEXT,
    "contactSnapshot" JSONB,
    "vatMode" "AccountVatMode" NOT NULL DEFAULT 'EXCLUDE',
    "vatTiming" "AccountVatTiming" NOT NULL DEFAULT 'ON_ISSUE',
    "subTotal" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "whtAmount" INTEGER NOT NULL DEFAULT 0,
    "depositDeducted" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL DEFAULT 0,
    "paidTotal" INTEGER NOT NULL DEFAULT 0,
    "sourceDocId" TEXT,
    "sourcePaymentId" TEXT,
    "taxPointBasis" "AccountVatTiming",
    "refSystemId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "categoryId" TEXT,
    "note" TEXT,
    "internalNote" TEXT,
    "adjustReason" TEXT,
    "whtIncomeType" "AccountWhtIncomeType",
    "whtRateBp" INTEGER,
    "etaxStatus" "AccountEtaxStatus" NOT NULL DEFAULT 'NOT_SENT',
    "etaxMeta" JSONB,
    "pdfUrl" TEXT,
    "publicToken" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "replacedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDocumentLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unitName" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "vatRateBp" INTEGER NOT NULL DEFAULT 700,
    "amount" INTEGER NOT NULL,
    "productId" TEXT,
    "accountId" TEXT,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDocumentPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "AccountPayChannel" NOT NULL DEFAULT 'TRANSFER',
    "financeAccountId" TEXT,
    "amount" INTEGER NOT NULL,
    "whtAmountSatang" INTEGER NOT NULL DEFAULT 0,
    "whtRateBp" INTEGER,
    "whtCertDocId" TEXT,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "chequeId" TEXT,
    "entryId" TEXT,
    "note" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDocumentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDocumentRelation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" "AccountRelationType" NOT NULL,
    "amount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDocumentRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDocSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "docType" "AccountDocType" NOT NULL,
    "prefix" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "lastNo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDocSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "kind" "AccountContactKind" NOT NULL DEFAULT 'CUSTOMER',
    "legalType" "AccountLegalType" NOT NULL DEFAULT 'COMPANY',
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "branchCode" TEXT DEFAULT '00000',
    "branchName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "creditTermDays" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL DEFAULT '',
    "orgNameEn" TEXT,
    "taxId" TEXT,
    "branchCode" TEXT DEFAULT '00000',
    "branchName" TEXT DEFAULT 'สำนักงานใหญ่',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT true,
    "vatRateBp" INTEGER NOT NULL DEFAULT 700,
    "defaultDueDays" INTEGER NOT NULL DEFAULT 30,
    "defaultValidDays" INTEGER NOT NULL DEFAULT 30,
    "footerNote" TEXT,
    "docConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "type" "AccountProductType" NOT NULL DEFAULT 'GOODS',
    "unitId" TEXT,
    "salePrice" INTEGER,
    "buyPrice" INTEGER,
    "vatRateBp" INTEGER NOT NULL DEFAULT 700,
    "incomeAccountId" TEXT,
    "expenseAccountId" TEXT,
    "imageUrl" TEXT,
    "qtyOnHand" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" JSONB NOT NULL DEFAULT '[]',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountFinance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "type" "AccountFinanceType" NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNo" TEXT,
    "promptpayId" TEXT,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3),
    "ledgerAccountId" TEXT,
    "showOnDocuments" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountFinance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCheque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "direction" "AccountChequeDirection" NOT NULL,
    "chequeNo" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankBranch" TEXT,
    "chequeDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "AccountChequeStatus" NOT NULL,
    "financeAccountId" TEXT,
    "clearedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountCheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "type" "AccountLedgerType" NOT NULL,
    "cashflowActivity" "AccountCashflowActivity" NOT NULL DEFAULT 'OPERATING',
    "parentId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountJournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "docNo" TEXT NOT NULL,
    "book" "AccountJournalBook" NOT NULL,
    "journal" "AccountJournalType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "periodKey" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "memo" TEXT,
    "source" "AccountEntrySource" NOT NULL,
    "status" "AccountEntryStatus" NOT NULL DEFAULT 'POSTED',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "reversalOfId" TEXT,
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountJournalLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "contactId" TEXT,
    "note" TEXT,

    CONSTRAINT "AccountJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "AccountPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenLog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountFixedAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "acquiredDate" TIMESTAMP(3) NOT NULL,
    "startDepDate" TIMESTAMP(3) NOT NULL,
    "cost" INTEGER NOT NULL,
    "salvageValue" INTEGER NOT NULL DEFAULT 100,
    "usefulLifeMonths" INTEGER NOT NULL,
    "assetAccountId" TEXT NOT NULL,
    "accumAccountId" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "status" "AccountAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposedAt" TIMESTAMP(3),
    "disposalAmount" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountFixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDepreciation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT,
    "folder" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSystemLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "linkedKind" "AccountLinkedKind" NOT NULL,
    "linkedId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSystemLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSystem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "SystemType" NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSystemUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "SystemType" NOT NULL,

    CONSTRAINT "AppSystemUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "priceSatang" INTEGER NOT NULL DEFAULT 0,
    "bufferMin" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingStaff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingStaffHours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "BookingStaffHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerId" TEXT,
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannelConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "type" "ChatChannelType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "webhookKey" TEXT NOT NULL,
    "defaultUnitId" TEXT,
    "status" "ChatConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "tokenExpiresAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "channel" "ChatChannelType" NOT NULL,
    "channelConnectionId" TEXT,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "customerId" TEXT,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "channel" "ChatChannelType" NOT NULL,
    "channelConnectionId" TEXT,
    "contactId" TEXT NOT NULL,
    "unitId" TEXT,
    "status" "ChatConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeUserId" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastMessageDirection" "ChatMessageDirection",
    "staffUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "replyWindowExpiresAt" TIMESTAMP(3),
    "firstCustomerMessageAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "ChatMessageDirection" NOT NULL,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "senderUserId" TEXT,
    "body" TEXT,
    "stickerMeta" JSONB,
    "orderContext" JSONB,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "clientMessageId" TEXT,
    "externalMessageId" TEXT,
    "deliveryStatus" "ChatDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "deliveryError" TEXT,
    "meta" JSONB,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "ChatMessageType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" "ChatEventType" NOT NULL,
    "actorUserId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatQuickReply" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channelTypes" JSONB NOT NULL DEFAULT '[]',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatQuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "memberSystemId" TEXT,
    "widgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "widgetDisabledUnitIds" JSONB NOT NULL DEFAULT '[]',
    "greetingMessage" JSONB NOT NULL DEFAULT '{}',
    "offlineMessage" JSONB NOT NULL DEFAULT '{}',
    "preChatFormEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slaFirstResponseMin" INTEGER NOT NULL DEFAULT 15,
    "unassignedAlertMin" INTEGER NOT NULL DEFAULT 5,
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatWebhookLog" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "channelType" "ChatChannelType" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "payloadHash" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "enabledModules" JSONB NOT NULL DEFAULT '[]',
    "limits" JSONB NOT NULL DEFAULT '{}',
    "customDomain" TEXT,
    "domainStatus" "DomainStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "UnitType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "unitAccess" JSONB NOT NULL DEFAULT '[]',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "AuthPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "PlatformRole" NOT NULL,
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "unitId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "onBehalfOf" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "percent" INTEGER,
    "valueSatang" INTEGER,
    "minSpendSatang" INTEGER,
    "maxDiscountSatang" INTEGER,
    "usageLimit" INTEGER,
    "perMemberLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "applicableUnitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "customerId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "saleId" TEXT,
    "discountSatang" INTEGER NOT NULL,
    "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRoomType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "baseRateSatang" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" TEXT,
    "status" "HotelRoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "HotelReservationStatus" NOT NULL DEFAULT 'BOOKED',
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "customerId" TEXT,
    "roomTypeId" TEXT NOT NULL,
    "roomId" TEXT,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "nights" INTEGER NOT NULL DEFAULT 1,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "ratePerNightSatang" INTEGER NOT NULL DEFAULT 0,
    "totalSatang" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanBoard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "KanbanEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanColumn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "KanbanEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeUserId" TEXT,
    "labels" JSONB NOT NULL DEFAULT '[]',
    "dueAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "KanbanEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MeetingChannelKind" NOT NULL DEFAULT 'PUBLIC',
    "topic" TEXT,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingChannelMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingChannelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "threadParentId" TEXT,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberSystemId" TEXT NOT NULL,
    "memberCode" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "tier" "MemberTier" NOT NULL DEFAULT 'MEMBER',
    "totalSpentSatang" INTEGER NOT NULL DEFAULT 0,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "unitId" TEXT,
    "module" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "satangPerPoint" INTEGER NOT NULL DEFAULT 2500,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "unitId" TEXT,
    "delta" INTEGER NOT NULL,
    "type" "PointTxType" NOT NULL,
    "reason" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "memberId" TEXT,
    "sourceModule" TEXT NOT NULL DEFAULT 'POS',
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "receiptNo" TEXT,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'PAID',
    "subtotalSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL DEFAULT 0,
    "vatSatang" INTEGER NOT NULL DEFAULT 0,
    "grandTotalSatang" INTEGER NOT NULL,
    "pointEarned" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL DEFAULT 0,
    "lineTotalSatang" INTEGER NOT NULL,

    CONSTRAINT "PosSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "PosPayType" NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "refSaleId" TEXT,
    "note" TEXT,

    CONSTRAINT "PosPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosReceiptCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosReceiptCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "prefix" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "onlineIssuable" BOOLEAN NOT NULL DEFAULT true,
    "kioskIssuable" BOOLEAN NOT NULL DEFAULT true,
    "requireContact" BOOLEAN NOT NULL DEFAULT false,
    "avgServiceMinFallback" INTEGER NOT NULL DEFAULT 10,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "QueueTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "code" TEXT NOT NULL,
    "status" "QueueCounterStatus" NOT NULL DEFAULT 'CLOSED',
    "activeUserId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueCounterType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "counterId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueCounterType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueuePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "notifyBeforeCount" INTEGER NOT NULL DEFAULT 3,
    "skippedExpiryMin" INTEGER NOT NULL DEFAULT 60,
    "recallAnnounceMax" INTEGER NOT NULL DEFAULT 2,
    "transferToFront" BOOLEAN NOT NULL DEFAULT true,
    "onlineIssueOpen" BOOLEAN NOT NULL DEFAULT true,
    "starvationRatio" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueuePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueDailySequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueDailySequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" "QueueTicketStatus" NOT NULL DEFAULT 'WAITING',
    "priority" INTEGER NOT NULL,
    "channel" "QueueIssueChannel" NOT NULL,
    "counterId" TEXT,
    "memberId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "publicToken" TEXT NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "transferredFromCounterId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "calledAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "issuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicketEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "counterId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueDisplay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayToken" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueDisplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "serviceChargeBps" INTEGER NOT NULL DEFAULT 0,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "serviceHours" JSONB NOT NULL DEFAULT '[]',
    "specialClosures" JSONB NOT NULL DEFAULT '[]',
    "lastOrderMins" INTEGER NOT NULL DEFAULT 30,
    "kitchenPaused" BOOLEAN NOT NULL DEFAULT false,
    "kitchenPausedNote" TEXT,
    "kdsWarnMins" INTEGER NOT NULL DEFAULT 8,
    "kdsCriticalMins" INTEGER NOT NULL DEFAULT 15,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pickupSlotMins" INTEGER NOT NULL DEFAULT 15,
    "pickupLeadMins" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TEXT,
    "availableTo" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "descriptionEn" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "basePrice" INTEGER NOT NULL,
    "sku" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "prepMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MenuItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "stockQty" INTEGER,
    "dailyStockQty" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuOptionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuOptionChoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuOptionChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemOptionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItemOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdsStation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdsStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "shape" "TableShape" NOT NULL DEFAULT 'RECT',
    "posX" INTEGER NOT NULL DEFAULT 0,
    "posY" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 2,
    "height" INTEGER NOT NULL DEFAULT 2,
    "qrToken" TEXT NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "guestCount" INTEGER,
    "memberId" TEXT,
    "openedByUserId" TEXT,
    "mergedIntoId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantDailyCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bizDate" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RestaurantDailyCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "RestOrderType" NOT NULL,
    "status" "RestOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "sessionId" TEXT,
    "bizDate" TEXT NOT NULL,
    "dailyNo" INTEGER NOT NULL,
    "memberId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "guestToken" TEXT,
    "note" TEXT,
    "isRush" BOOLEAN NOT NULL DEFAULT false,
    "pickupStatus" "PickupStatus",
    "pickupAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "placedByUserId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "stationId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "optionsTotal" INTEGER NOT NULL DEFAULT 0,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "lineTotal" INTEGER NOT NULL,
    "note" TEXT,
    "kdsStatus" "KdsItemStatus" NOT NULL DEFAULT 'NEW',
    "isRush" BOOLEAN NOT NULL DEFAULT false,
    "cookingAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledByUserId" TEXT,
    "saleId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrderItemOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "choiceId" TEXT,
    "groupSnapshot" TEXT NOT NULL,
    "choiceSnapshot" TEXT NOT NULL,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RestaurantOrderItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantServiceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "ServiceRequestType" NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "ackedByUserId" TEXT,
    "ackedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "stock" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RewardRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "venue" TEXT,
    "coverImageUrl" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "TicketEventStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceSatang" INTEGER NOT NULL DEFAULT 0,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "customerId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "status" "TicketOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalSatang" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'STAFF',
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAdmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "priceSatang" INTEGER NOT NULL DEFAULT 0,
    "attendeeName" TEXT,
    "status" "TicketAdmissionStatus" NOT NULL DEFAULT 'VALID',
    "checkedInAt" TIMESTAMP(3),
    "checkedInBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocument_publicToken_key" ON "AccountDocument"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocument_replacedById_key" ON "AccountDocument"("replacedById");

-- CreateIndex
CREATE INDEX "AccountDocument_systemId_docType_status_issueDate_idx" ON "AccountDocument"("systemId", "docType", "status", "issueDate");

-- CreateIndex
CREATE INDEX "AccountDocument_systemId_docType_dueDate_idx" ON "AccountDocument"("systemId", "docType", "dueDate");

-- CreateIndex
CREATE INDEX "AccountDocument_systemId_contactId_docType_idx" ON "AccountDocument"("systemId", "contactId", "docType");

-- CreateIndex
CREATE INDEX "AccountDocument_systemId_direction_issueDate_idx" ON "AccountDocument"("systemId", "direction", "issueDate");

-- CreateIndex
CREATE INDEX "AccountDocument_tenantId_systemId_idx" ON "AccountDocument"("tenantId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocument_systemId_docType_docNo_key" ON "AccountDocument"("systemId", "docType", "docNo");

-- CreateIndex
CREATE INDEX "AccountDocumentLine_documentId_sortOrder_idx" ON "AccountDocumentLine"("documentId", "sortOrder");

-- CreateIndex
CREATE INDEX "AccountDocumentLine_systemId_productId_idx" ON "AccountDocumentLine"("systemId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocumentPayment_whtCertDocId_key" ON "AccountDocumentPayment"("whtCertDocId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocumentPayment_chequeId_key" ON "AccountDocumentPayment"("chequeId");

-- CreateIndex
CREATE INDEX "AccountDocumentPayment_systemId_paidAt_idx" ON "AccountDocumentPayment"("systemId", "paidAt");

-- CreateIndex
CREATE INDEX "AccountDocumentPayment_documentId_idx" ON "AccountDocumentPayment"("documentId");

-- CreateIndex
CREATE INDEX "AccountDocumentRelation_systemId_type_idx" ON "AccountDocumentRelation"("systemId", "type");

-- CreateIndex
CREATE INDEX "AccountDocumentRelation_toId_idx" ON "AccountDocumentRelation"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocumentRelation_fromId_toId_type_key" ON "AccountDocumentRelation"("fromId", "toId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocSequence_systemId_docType_periodKey_key" ON "AccountDocSequence"("systemId", "docType", "periodKey");

-- CreateIndex
CREATE INDEX "AccountContact_systemId_kind_archivedAt_idx" ON "AccountContact"("systemId", "kind", "archivedAt");

-- CreateIndex
CREATE INDEX "AccountContact_systemId_taxId_idx" ON "AccountContact"("systemId", "taxId");

-- CreateIndex
CREATE INDEX "AccountContact_systemId_name_idx" ON "AccountContact"("systemId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSettings_systemId_key" ON "AccountSettings"("systemId");

-- CreateIndex
CREATE INDEX "AccountSettings_tenantId_systemId_idx" ON "AccountSettings"("tenantId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountUnit_systemId_name_key" ON "AccountUnit"("systemId", "name");

-- CreateIndex
CREATE INDEX "AccountProduct_systemId_type_archivedAt_idx" ON "AccountProduct"("systemId", "type", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountProduct_systemId_sku_key" ON "AccountProduct"("systemId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCategory_systemId_name_key" ON "AccountCategory"("systemId", "name");

-- CreateIndex
CREATE INDEX "AccountFinance_systemId_type_archivedAt_idx" ON "AccountFinance"("systemId", "type", "archivedAt");

-- CreateIndex
CREATE INDEX "AccountCheque_systemId_direction_status_idx" ON "AccountCheque"("systemId", "direction", "status");

-- CreateIndex
CREATE INDEX "AccountLedger_systemId_type_archivedAt_idx" ON "AccountLedger"("systemId", "type", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountLedger_systemId_code_key" ON "AccountLedger"("systemId", "code");

-- CreateIndex
CREATE INDEX "AccountMapping_systemId_idx" ON "AccountMapping"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMapping_systemId_key_key" ON "AccountMapping"("systemId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AccountJournalEntry_reversalOfId_key" ON "AccountJournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "AccountJournalEntry_systemId_periodKey_book_idx" ON "AccountJournalEntry"("systemId", "periodKey", "book");

-- CreateIndex
CREATE INDEX "AccountJournalEntry_systemId_date_idx" ON "AccountJournalEntry"("systemId", "date");

-- CreateIndex
CREATE INDEX "AccountJournalEntry_refType_refId_idx" ON "AccountJournalEntry"("refType", "refId");

-- CreateIndex
CREATE INDEX "AccountJournalEntry_systemId_needsReview_idx" ON "AccountJournalEntry"("systemId", "needsReview");

-- CreateIndex
CREATE UNIQUE INDEX "AccountJournalEntry_systemId_docNo_key" ON "AccountJournalEntry"("systemId", "docNo");

-- CreateIndex
CREATE UNIQUE INDEX "AccountJournalEntry_tenantId_idempotencyKey_key" ON "AccountJournalEntry"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AccountJournalLine_entryId_idx" ON "AccountJournalLine"("entryId");

-- CreateIndex
CREATE INDEX "AccountJournalLine_systemId_accountId_idx" ON "AccountJournalLine"("systemId", "accountId");

-- CreateIndex
CREATE INDEX "AccountJournalLine_systemId_contactId_accountId_idx" ON "AccountJournalLine"("systemId", "contactId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPeriod_systemId_periodKey_key" ON "AccountPeriod"("systemId", "periodKey");

-- CreateIndex
CREATE INDEX "AccountFixedAsset_systemId_status_idx" ON "AccountFixedAsset"("systemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountFixedAsset_systemId_code_key" ON "AccountFixedAsset"("systemId", "code");

-- CreateIndex
CREATE INDEX "AccountDepreciation_systemId_periodKey_idx" ON "AccountDepreciation"("systemId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDepreciation_assetId_periodKey_key" ON "AccountDepreciation"("assetId", "periodKey");

-- CreateIndex
CREATE INDEX "AccountAttachment_systemId_documentId_idx" ON "AccountAttachment"("systemId", "documentId");

-- CreateIndex
CREATE INDEX "AccountAttachment_systemId_folder_idx" ON "AccountAttachment"("systemId", "folder");

-- CreateIndex
CREATE INDEX "AccountSystemLink_linkedKind_linkedId_idx" ON "AccountSystemLink"("linkedKind", "linkedId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSystemLink_systemId_linkedKind_linkedId_key" ON "AccountSystemLink"("systemId", "linkedKind", "linkedId");

-- CreateIndex
CREATE INDEX "AppSystem_tenantId_type_idx" ON "AppSystem"("tenantId", "type");

-- CreateIndex
CREATE INDEX "AppSystemUnit_systemId_idx" ON "AppSystemUnit"("systemId");

-- CreateIndex
CREATE INDEX "AppSystemUnit_tenantId_unitId_idx" ON "AppSystemUnit"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSystemUnit_tenantId_unitId_type_key" ON "AppSystemUnit"("tenantId", "unitId", "type");

-- CreateIndex
CREATE INDEX "BookingService_tenantId_unitId_idx" ON "BookingService"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "BookingStaff_tenantId_unitId_idx" ON "BookingStaff"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "BookingStaffHours_staffId_idx" ON "BookingStaffHours"("staffId");

-- CreateIndex
CREATE INDEX "BookingStaffHours_tenantId_unitId_idx" ON "BookingStaffHours"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_unitId_startAt_idx" ON "Appointment"("tenantId", "unitId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_staffId_startAt_idx" ON "Appointment"("staffId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannelConnection_webhookKey_key" ON "ChatChannelConnection"("webhookKey");

-- CreateIndex
CREATE INDEX "ChatChannelConnection_tenantId_systemId_status_idx" ON "ChatChannelConnection"("tenantId", "systemId", "status");

-- CreateIndex
CREATE INDEX "ChatChannelConnection_tokenExpiresAt_idx" ON "ChatChannelConnection"("tokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannelConnection_systemId_type_externalAccountId_key" ON "ChatChannelConnection"("systemId", "type", "externalAccountId");

-- CreateIndex
CREATE INDEX "ChatContact_systemId_customerId_idx" ON "ChatContact"("systemId", "customerId");

-- CreateIndex
CREATE INDEX "ChatContact_systemId_channel_lastSeenAt_idx" ON "ChatContact"("systemId", "channel", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ChatContact_tenantId_phone_idx" ON "ChatContact"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "ChatContact_systemId_channel_channelConnectionId_externalUs_key" ON "ChatContact"("systemId", "channel", "channelConnectionId", "externalUserId");

-- CreateIndex
CREATE INDEX "ChatConversation_systemId_status_lastMessageAt_idx" ON "ChatConversation"("systemId", "status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "ChatConversation_systemId_channel_status_idx" ON "ChatConversation"("systemId", "channel", "status");

-- CreateIndex
CREATE INDEX "ChatConversation_systemId_assigneeUserId_status_idx" ON "ChatConversation"("systemId", "assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "ChatConversation_systemId_unitId_status_idx" ON "ChatConversation"("systemId", "unitId", "status");

-- CreateIndex
CREATE INDEX "ChatConversation_contactId_idx" ON "ChatConversation"("contactId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_systemId_createdAt_idx" ON "ChatMessage"("systemId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_systemId_deliveryStatus_idx" ON "ChatMessage"("systemId", "deliveryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_clientMessageId_key" ON "ChatMessage"("conversationId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_externalMessageId_key" ON "ChatMessage"("conversationId", "externalMessageId");

-- CreateIndex
CREATE INDEX "ChatAttachment_messageId_idx" ON "ChatAttachment"("messageId");

-- CreateIndex
CREATE INDEX "ChatAttachment_systemId_createdAt_idx" ON "ChatAttachment"("systemId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatReadState_systemId_userId_idx" ON "ChatReadState"("systemId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReadState_conversationId_userId_key" ON "ChatReadState"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ChatConversationEvent_conversationId_createdAt_idx" ON "ChatConversationEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatConversationEvent_systemId_type_createdAt_idx" ON "ChatConversationEvent"("systemId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ChatQuickReply_systemId_idx" ON "ChatQuickReply"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatQuickReply_systemId_shortcut_key" ON "ChatQuickReply"("systemId", "shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSetting_systemId_key" ON "ChatSetting"("systemId");

-- CreateIndex
CREATE INDEX "ChatWebhookLog_createdAt_idx" ON "ChatWebhookLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatWebhookLog_connectionId_eventKey_key" ON "ChatWebhookLog"("connectionId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_customDomain_key" ON "Tenant"("customDomain");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE INDEX "BusinessUnit_tenantId_type_idx" ON "BusinessUnit"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_tenantId_slug_key" ON "BusinessUnit"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "AuthToken_email_purpose_idx" ON "AuthToken"("email", "purpose");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "Coupon_tenantId_systemId_idx" ON "Coupon"("tenantId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_systemId_code_key" ON "Coupon"("systemId", "code");

-- CreateIndex
CREATE INDEX "CouponRedemption_tenantId_systemId_couponId_status_idx" ON "CouponRedemption"("tenantId", "systemId", "couponId", "status");

-- CreateIndex
CREATE INDEX "CouponRedemption_tenantId_systemId_customerId_status_idx" ON "CouponRedemption"("tenantId", "systemId", "customerId", "status");

-- CreateIndex
CREATE INDEX "CouponRedemption_tenantId_saleId_idx" ON "CouponRedemption"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "HotelRoomType_tenantId_unitId_idx" ON "HotelRoomType"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "HotelRoomType_unitId_active_sortOrder_idx" ON "HotelRoomType"("unitId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomType_unitId_name_key" ON "HotelRoomType"("unitId", "name");

-- CreateIndex
CREATE INDEX "HotelRoom_tenantId_unitId_idx" ON "HotelRoom"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "HotelRoom_unitId_roomTypeId_active_idx" ON "HotelRoom"("unitId", "roomTypeId", "active");

-- CreateIndex
CREATE INDEX "HotelRoom_unitId_status_idx" ON "HotelRoom"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoom_unitId_number_key" ON "HotelRoom"("unitId", "number");

-- CreateIndex
CREATE INDEX "HotelReservation_tenantId_unitId_idx" ON "HotelReservation"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "HotelReservation_unitId_status_checkInDate_idx" ON "HotelReservation"("unitId", "status", "checkInDate");

-- CreateIndex
CREATE INDEX "HotelReservation_unitId_roomTypeId_checkInDate_checkOutDate_idx" ON "HotelReservation"("unitId", "roomTypeId", "checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "HotelReservation_unitId_roomId_checkInDate_checkOutDate_idx" ON "HotelReservation"("unitId", "roomId", "checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "HotelReservation_unitId_guestPhone_idx" ON "HotelReservation"("unitId", "guestPhone");

-- CreateIndex
CREATE UNIQUE INDEX "HotelReservation_unitId_code_key" ON "HotelReservation"("unitId", "code");

-- CreateIndex
CREATE INDEX "KanbanBoard_tenantId_systemId_status_idx" ON "KanbanBoard"("tenantId", "systemId", "status");

-- CreateIndex
CREATE INDEX "KanbanColumn_tenantId_systemId_boardId_idx" ON "KanbanColumn"("tenantId", "systemId", "boardId");

-- CreateIndex
CREATE INDEX "KanbanColumn_boardId_status_sortOrder_idx" ON "KanbanColumn"("boardId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "KanbanCard_tenantId_systemId_boardId_status_idx" ON "KanbanCard"("tenantId", "systemId", "boardId", "status");

-- CreateIndex
CREATE INDEX "KanbanCard_columnId_status_sortOrder_idx" ON "KanbanCard"("columnId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "KanbanCard_tenantId_systemId_assigneeUserId_idx" ON "KanbanCard"("tenantId", "systemId", "assigneeUserId");

-- CreateIndex
CREATE INDEX "MeetingChannel_tenantId_systemId_archivedAt_idx" ON "MeetingChannel"("tenantId", "systemId", "archivedAt");

-- CreateIndex
CREATE INDEX "MeetingChannel_systemId_lastMessageAt_idx" ON "MeetingChannel"("systemId", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingChannel_systemId_name_key" ON "MeetingChannel"("systemId", "name");

-- CreateIndex
CREATE INDEX "MeetingChannelMember_systemId_userId_leftAt_idx" ON "MeetingChannelMember"("systemId", "userId", "leftAt");

-- CreateIndex
CREATE INDEX "MeetingChannelMember_channelId_leftAt_idx" ON "MeetingChannelMember"("channelId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingChannelMember_channelId_userId_key" ON "MeetingChannelMember"("channelId", "userId");

-- CreateIndex
CREATE INDEX "MeetingMessage_channelId_threadParentId_createdAt_id_idx" ON "MeetingMessage"("channelId", "threadParentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MeetingMessage_threadParentId_createdAt_id_idx" ON "MeetingMessage"("threadParentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MeetingMessage_tenantId_systemId_createdAt_idx" ON "MeetingMessage"("tenantId", "systemId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_memberSystemId_idx" ON "Customer"("memberSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_memberSystemId_phone_key" ON "Customer"("memberSystemId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_memberSystemId_memberCode_key" ON "Customer"("memberSystemId", "memberCode");

-- CreateIndex
CREATE INDEX "MemberActivity_tenantId_customerId_createdAt_idx" ON "MemberActivity"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointSettings_tenantId_key" ON "PointSettings"("tenantId");

-- CreateIndex
CREATE INDEX "PointLedger_systemId_customerId_createdAt_idx" ON "PointLedger"("systemId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointLedger_tenantId_idempotencyKey_key" ON "PointLedger"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PointBalance_systemId_customerId_key" ON "PointBalance"("systemId", "customerId");

-- CreateIndex
CREATE INDEX "PosSale_tenantId_unitId_createdAt_idx" ON "PosSale"("tenantId", "unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_tenantId_idempotencyKey_key" ON "PosSale"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_unitId_receiptNo_key" ON "PosSale"("unitId", "receiptNo");

-- CreateIndex
CREATE INDEX "PosSaleLine_saleId_idx" ON "PosSaleLine"("saleId");

-- CreateIndex
CREATE INDEX "PosPayment_saleId_idx" ON "PosPayment"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "PosReceiptCounter_unitId_period_key" ON "PosReceiptCounter"("unitId", "period");

-- CreateIndex
CREATE INDEX "QueueType_tenantId_idx" ON "QueueType"("tenantId");

-- CreateIndex
CREATE INDEX "QueueType_unitId_status_idx" ON "QueueType"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueType_unitId_code_key" ON "QueueType"("unitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "QueueType_unitId_prefix_key" ON "QueueType"("unitId", "prefix");

-- CreateIndex
CREATE INDEX "QueueCounter_tenantId_idx" ON "QueueCounter"("tenantId");

-- CreateIndex
CREATE INDEX "QueueCounter_unitId_status_idx" ON "QueueCounter"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueCounter_unitId_code_key" ON "QueueCounter"("unitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "QueueCounter_unitId_name_key" ON "QueueCounter"("unitId", "name");

-- CreateIndex
CREATE INDEX "QueueCounterType_tenantId_idx" ON "QueueCounterType"("tenantId");

-- CreateIndex
CREATE INDEX "QueueCounterType_unitId_typeId_idx" ON "QueueCounterType"("unitId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueCounterType_counterId_typeId_key" ON "QueueCounterType"("counterId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "QueuePolicy_unitId_key" ON "QueuePolicy"("unitId");

-- CreateIndex
CREATE INDEX "QueuePolicy_tenantId_idx" ON "QueuePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "QueueDailySequence_tenantId_idx" ON "QueueDailySequence"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueDailySequence_unitId_typeId_businessDate_key" ON "QueueDailySequence"("unitId", "typeId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_publicToken_key" ON "QueueTicket"("publicToken");

-- CreateIndex
CREATE INDEX "QueueTicket_tenantId_idx" ON "QueueTicket"("tenantId");

-- CreateIndex
CREATE INDEX "QueueTicket_unitId_businessDate_status_priority_createdAt_idx" ON "QueueTicket"("unitId", "businessDate", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "QueueTicket_unitId_counterId_status_idx" ON "QueueTicket"("unitId", "counterId", "status");

-- CreateIndex
CREATE INDEX "QueueTicket_refType_refId_idx" ON "QueueTicket"("refType", "refId");

-- CreateIndex
CREATE INDEX "QueueTicket_memberId_idx" ON "QueueTicket"("memberId");

-- CreateIndex
CREATE INDEX "QueueTicket_unitId_contactPhone_businessDate_status_idx" ON "QueueTicket"("unitId", "contactPhone", "businessDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_unitId_typeId_businessDate_seq_key" ON "QueueTicket"("unitId", "typeId", "businessDate", "seq");

-- CreateIndex
CREATE INDEX "QueueTicketEvent_tenantId_idx" ON "QueueTicketEvent"("tenantId");

-- CreateIndex
CREATE INDEX "QueueTicketEvent_ticketId_createdAt_idx" ON "QueueTicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "QueueTicketEvent_unitId_createdAt_idx" ON "QueueTicketEvent"("unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueDisplay_displayToken_key" ON "QueueDisplay"("displayToken");

-- CreateIndex
CREATE INDEX "QueueDisplay_tenantId_idx" ON "QueueDisplay"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueDisplay_unitId_name_key" ON "QueueDisplay"("unitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSetting_unitId_key" ON "RestaurantSetting"("unitId");

-- CreateIndex
CREATE INDEX "RestaurantSetting_tenantId_idx" ON "RestaurantSetting"("tenantId");

-- CreateIndex
CREATE INDEX "MenuCategory_tenantId_idx" ON "MenuCategory"("tenantId");

-- CreateIndex
CREATE INDEX "MenuCategory_unitId_sortOrder_idx" ON "MenuCategory"("unitId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_unitId_name_key" ON "MenuCategory"("unitId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItem_unitId_categoryId_sortOrder_idx" ON "MenuItem"("unitId", "categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_unitId_status_isOutOfStock_idx" ON "MenuItem"("unitId", "status", "isOutOfStock");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_unitId_sku_key" ON "MenuItem"("unitId", "sku");

-- CreateIndex
CREATE INDEX "MenuOptionGroup_tenantId_idx" ON "MenuOptionGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuOptionGroup_unitId_name_key" ON "MenuOptionGroup"("unitId", "name");

-- CreateIndex
CREATE INDEX "MenuOptionChoice_tenantId_idx" ON "MenuOptionChoice"("tenantId");

-- CreateIndex
CREATE INDEX "MenuOptionChoice_unitId_idx" ON "MenuOptionChoice"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuOptionChoice_groupId_name_key" ON "MenuOptionChoice"("groupId", "name");

-- CreateIndex
CREATE INDEX "MenuItemOptionGroup_tenantId_idx" ON "MenuItemOptionGroup"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItemOptionGroup_unitId_idx" ON "MenuItemOptionGroup"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemOptionGroup_itemId_groupId_key" ON "MenuItemOptionGroup"("itemId", "groupId");

-- CreateIndex
CREATE INDEX "KdsStation_tenantId_idx" ON "KdsStation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "KdsStation_unitId_name_key" ON "KdsStation"("unitId", "name");

-- CreateIndex
CREATE INDEX "RestaurantZone_tenantId_idx" ON "RestaurantZone"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantZone_unitId_name_key" ON "RestaurantZone"("unitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_qrToken_key" ON "RestaurantTable"("qrToken");

-- CreateIndex
CREATE INDEX "RestaurantTable_tenantId_idx" ON "RestaurantTable"("tenantId");

-- CreateIndex
CREATE INDEX "RestaurantTable_unitId_zoneId_idx" ON "RestaurantTable"("unitId", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_unitId_name_key" ON "RestaurantTable"("unitId", "name");

-- CreateIndex
CREATE INDEX "TableSession_tenantId_idx" ON "TableSession"("tenantId");

-- CreateIndex
CREATE INDEX "TableSession_unitId_status_idx" ON "TableSession"("unitId", "status");

-- CreateIndex
CREATE INDEX "TableSession_unitId_tableId_status_idx" ON "TableSession"("unitId", "tableId", "status");

-- CreateIndex
CREATE INDEX "RestaurantDailyCounter_tenantId_idx" ON "RestaurantDailyCounter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDailyCounter_unitId_bizDate_key" ON "RestaurantDailyCounter"("unitId", "bizDate");

-- CreateIndex
CREATE INDEX "RestaurantOrder_tenantId_idx" ON "RestaurantOrder"("tenantId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_unitId_bizDate_type_idx" ON "RestaurantOrder"("unitId", "bizDate", "type");

-- CreateIndex
CREATE INDEX "RestaurantOrder_unitId_status_idx" ON "RestaurantOrder"("unitId", "status");

-- CreateIndex
CREATE INDEX "RestaurantOrder_sessionId_idx" ON "RestaurantOrder"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrder_unitId_bizDate_dailyNo_key" ON "RestaurantOrder"("unitId", "bizDate", "dailyNo");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_tenantId_idx" ON "RestaurantOrderItem"("tenantId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_unitId_stationId_kdsStatus_idx" ON "RestaurantOrderItem"("unitId", "stationId", "kdsStatus");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_unitId_kdsStatus_isRush_createdAt_idx" ON "RestaurantOrderItem"("unitId", "kdsStatus", "isRush", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_orderId_idx" ON "RestaurantOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_unitId_menuItemId_idx" ON "RestaurantOrderItem"("unitId", "menuItemId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_saleId_idx" ON "RestaurantOrderItem"("saleId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItemOption_tenantId_idx" ON "RestaurantOrderItemOption"("tenantId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItemOption_unitId_idx" ON "RestaurantOrderItemOption"("unitId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItemOption_orderItemId_idx" ON "RestaurantOrderItemOption"("orderItemId");

-- CreateIndex
CREATE INDEX "RestaurantServiceRequest_tenantId_idx" ON "RestaurantServiceRequest"("tenantId");

-- CreateIndex
CREATE INDEX "RestaurantServiceRequest_unitId_status_createdAt_idx" ON "RestaurantServiceRequest"("unitId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantServiceRequest_sessionId_idx" ON "RestaurantServiceRequest"("sessionId");

-- CreateIndex
CREATE INDEX "Reward_tenantId_systemId_idx" ON "Reward"("tenantId", "systemId");

-- CreateIndex
CREATE INDEX "RewardRedemption_tenantId_systemId_customerId_idx" ON "RewardRedemption"("tenantId", "systemId", "customerId");

-- CreateIndex
CREATE INDEX "TicketEvent_tenantId_idx" ON "TicketEvent"("tenantId");

-- CreateIndex
CREATE INDEX "TicketEvent_unitId_status_idx" ON "TicketEvent"("unitId", "status");

-- CreateIndex
CREATE INDEX "TicketEvent_unitId_startAt_idx" ON "TicketEvent"("unitId", "startAt");

-- CreateIndex
CREATE INDEX "TicketType_tenantId_idx" ON "TicketType"("tenantId");

-- CreateIndex
CREATE INDEX "TicketType_unitId_idx" ON "TicketType"("unitId");

-- CreateIndex
CREATE INDEX "TicketType_eventId_idx" ON "TicketType"("eventId");

-- CreateIndex
CREATE INDEX "TicketOrder_tenantId_idx" ON "TicketOrder"("tenantId");

-- CreateIndex
CREATE INDEX "TicketOrder_unitId_status_idx" ON "TicketOrder"("unitId", "status");

-- CreateIndex
CREATE INDEX "TicketOrder_eventId_status_idx" ON "TicketOrder"("eventId", "status");

-- CreateIndex
CREATE INDEX "TicketOrder_customerId_idx" ON "TicketOrder"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrder_unitId_orderNo_key" ON "TicketOrder"("unitId", "orderNo");

-- CreateIndex
CREATE INDEX "TicketAdmission_tenantId_idx" ON "TicketAdmission"("tenantId");

-- CreateIndex
CREATE INDEX "TicketAdmission_unitId_status_idx" ON "TicketAdmission"("unitId", "status");

-- CreateIndex
CREATE INDEX "TicketAdmission_eventId_status_idx" ON "TicketAdmission"("eventId", "status");

-- CreateIndex
CREATE INDEX "TicketAdmission_orderId_idx" ON "TicketAdmission"("orderId");

-- CreateIndex
CREATE INDEX "TicketAdmission_ticketTypeId_idx" ON "TicketAdmission"("ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAdmission_unitId_code_key" ON "TicketAdmission"("unitId", "code");

-- AddForeignKey
ALTER TABLE "AccountDocument" ADD CONSTRAINT "AccountDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocument" ADD CONSTRAINT "AccountDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccountCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentLine" ADD CONSTRAINT "AccountDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentLine" ADD CONSTRAINT "AccountDocumentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AccountProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentLine" ADD CONSTRAINT "AccountDocumentLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentPayment" ADD CONSTRAINT "AccountDocumentPayment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentPayment" ADD CONSTRAINT "AccountDocumentPayment_financeAccountId_fkey" FOREIGN KEY ("financeAccountId") REFERENCES "AccountFinance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentPayment" ADD CONSTRAINT "AccountDocumentPayment_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "AccountCheque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentRelation" ADD CONSTRAINT "AccountDocumentRelation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocumentRelation" ADD CONSTRAINT "AccountDocumentRelation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLedger" ADD CONSTRAINT "AccountLedger_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountJournalEntry" ADD CONSTRAINT "AccountJournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "AccountJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountJournalLine" ADD CONSTRAINT "AccountJournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountJournalLine" ADD CONSTRAINT "AccountJournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDepreciation" ADD CONSTRAINT "AccountDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AccountFixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAttachment" ADD CONSTRAINT "AccountAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSystemUnit" ADD CONSTRAINT "AppSystemUnit_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "AppSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingStaffHours" ADD CONSTRAINT "BookingStaffHours_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "BookingStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "BookingStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BookingService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatContact" ADD CONSTRAINT "ChatContact_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChatChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChatChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversationEvent" ADD CONSTRAINT "ChatConversationEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUnit" ADD CONSTRAINT "BusinessUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanColumn" ADD CONSTRAINT "KanbanColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "KanbanColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingChannelMember" ADD CONSTRAINT "MeetingChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "MeetingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMessage" ADD CONSTRAINT "MeetingMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "MeetingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMessage" ADD CONSTRAINT "MeetingMessage_threadParentId_fkey" FOREIGN KEY ("threadParentId") REFERENCES "MeetingMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberActivity" ADD CONSTRAINT "MemberActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleLine" ADD CONSTRAINT "PosSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueCounterType" ADD CONSTRAINT "QueueCounterType_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "QueueCounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueCounterType" ADD CONSTRAINT "QueueCounterType_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "QueueType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "QueueType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "QueueCounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicketEvent" ADD CONSTRAINT "QueueTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "QueueTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "KdsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOptionChoice" ADD CONSTRAINT "MenuOptionChoice_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MenuOptionGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemOptionGroup" ADD CONSTRAINT "MenuItemOptionGroup_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemOptionGroup" ADD CONSTRAINT "MenuItemOptionGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MenuOptionGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "RestaurantZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "KdsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderItemOption" ADD CONSTRAINT "RestaurantOrderItemOption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "RestaurantOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantServiceRequest" ADD CONSTRAINT "RestaurantServiceRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAdmission" ADD CONSTRAINT "TicketAdmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAdmission" ADD CONSTRAINT "TicketAdmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAdmission" ADD CONSTRAINT "TicketAdmission_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

