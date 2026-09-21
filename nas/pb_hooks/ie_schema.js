// สร้างโดย scripts/gen-pb-migration.mjs จาก lib/db/schema.ts — ห้ามแก้ด้วยมือ
module.exports = {
  "fields": {
    "users": [
      "studentId",
      "firstName",
      "lastName",
      "nickname",
      "phone",
      "role",
      "skills",
      "seniority",
      "note",
      "title",
      "profileImageUrl",
      "profileCompleted",
      "disabled",
      "createdAt",
      "pushSubscription",
      "pushSubscriptions",
      "memberCode"
    ],
    "banned": [
      "bannedAt",
      "by"
    ],
    "crew": [
      "photographerId",
      "addedAt"
    ],
    "availability": [
      "busyDates",
      "notes",
      "updatedAt"
    ],
    "equipments": [
      "name",
      "type",
      "status",
      "code",
      "note",
      "imageUrl",
      "responsibleUserId",
      "responsibleUserName",
      "assignedAt",
      "pairGroups"
    ],
    "studios": [
      "name",
      "status",
      "subtitle",
      "tags",
      "features",
      "openHours",
      "contactPhone",
      "theme"
    ],
    "photographers": [
      "name",
      "uid",
      "role",
      "bio",
      "skills",
      "avatarUrl",
      "status",
      "sortOrder"
    ],
    "slots": [
      "bookingId",
      "itemId",
      "itemName",
      "bookingType",
      "startAt",
      "endAt",
      "status"
    ],
    "bookings": [
      "bookingType",
      "itemId",
      "itemName",
      "userId",
      "userName",
      "userPhone",
      "guestName",
      "guestEmail",
      "startAt",
      "endAt",
      "formImageUrl",
      "returnImageUrl",
      "usageReason",
      "usageType",
      "status",
      "assigneeIds",
      "responsibleUserId",
      "responsibleUserName",
      "consentToken",
      "createdAt",
      "reminderSentAt",
      "location",
      "crewSize",
      "formId",
      "formResponseId",
      "discordNotifiedAt",
      "pickedUpAt",
      "liabilityAcceptedAt",
      "approvedById",
      "approvedByName",
      "approvedAt",
      "requestId",
      "overnight",
      "overnightStorage",
      "handoverImageUrl"
    ],
    "tasks": [
      "title",
      "description",
      "assignedById",
      "assignedByName",
      "assignedToId",
      "assignedToName",
      "bookingId",
      "status",
      "dueDate",
      "createdAt",
      "reminderSentAt"
    ],
    "aiChats": [
      "title",
      "ownerId",
      "ownerName",
      "turnsJson",
      "turnCount",
      "createdAt",
      "updatedAt"
    ],
    "mailQueue": [
      "to",
      "subject",
      "body",
      "status",
      "kind",
      "refId",
      "dedupeKey",
      "replyTo",
      "sentById",
      "forwarded",
      "error",
      "createdAt",
      "sentAt"
    ],
    "feeds": [
      "message",
      "bookingId",
      "userId",
      "formImageUrl",
      "bookingStatus",
      "likedBy",
      "likeCount",
      "createdAt"
    ],
    "forms": [
      "title",
      "description",
      "fields",
      "binding",
      "active",
      "allowGuest",
      "successMessage",
      "createdById",
      "createdAt",
      "updatedAt",
      "responseCount"
    ],
    "formResponses": [
      "formId",
      "formTitle",
      "values",
      "userId",
      "submitterName",
      "submitterContact",
      "bookingId",
      "createdAt"
    ],
    "deliveries": [
      "title",
      "bookingId",
      "customerUserId",
      "customerName",
      "customerContact",
      "assigneeIds",
      "assignedToId",
      "assignedToName",
      "uploadUrl",
      "downloadUrl",
      "passcode",
      "note",
      "status",
      "dueAt",
      "expiresAt",
      "createdById",
      "createdAt",
      "updatedAt"
    ],
    "settings": [
      "siteName",
      "tagline",
      "contactPhone",
      "contactEmail",
      "galleryUrl",
      "accentColor",
      "maxAdvanceDays",
      "maxBorrowDays",
      "maxStudioHours",
      "requireBorrowDocument",
      "allowGuestStudioBooking",
      "allowGuestPhotographerBooking",
      "photographerJobTypes",
      "maxCrewSize",
      "notifyEmail",
      "notifyEmailAddress",
      "mailSenderStudentId",
      "memberTitles",
      "nasBaseUrl",
      "nasUploadHint",
      "uploadLinkUrl",
      "deliveryDefaultDays",
      "featureFeed",
      "featureTasks",
      "featureBorrow",
      "featureStudio",
      "featurePhotographer",
      "featureForms",
      "featureDeliveries",
      "announcement",
      "updatedAt",
      "updatedBy"
    ],
    "secrets": [
      "baseUrl",
      "apiKey",
      "model",
      "models",
      "enabled",
      "discordWebhookUrl"
    ],
    "files": [
      "file",
      "owner",
      "kind",
      "createdAt"
    ]
  },
  "dates": {
    "users": [
      "createdAt"
    ],
    "banned": [
      "bannedAt"
    ],
    "crew": [
      "addedAt"
    ],
    "availability": [
      "updatedAt"
    ],
    "equipments": [
      "assignedAt"
    ],
    "studios": [],
    "photographers": [],
    "slots": [
      "startAt",
      "endAt"
    ],
    "bookings": [
      "startAt",
      "endAt",
      "createdAt",
      "reminderSentAt",
      "discordNotifiedAt",
      "pickedUpAt",
      "liabilityAcceptedAt",
      "approvedAt"
    ],
    "tasks": [
      "dueDate",
      "createdAt",
      "reminderSentAt"
    ],
    "aiChats": [
      "createdAt",
      "updatedAt"
    ],
    "mailQueue": [
      "createdAt",
      "sentAt"
    ],
    "feeds": [
      "createdAt"
    ],
    "forms": [
      "createdAt",
      "updatedAt"
    ],
    "formResponses": [
      "createdAt"
    ],
    "deliveries": [
      "dueAt",
      "expiresAt",
      "createdAt",
      "updatedAt"
    ],
    "settings": [
      "updatedAt"
    ],
    "secrets": [],
    "files": [
      "createdAt"
    ]
  }
};
