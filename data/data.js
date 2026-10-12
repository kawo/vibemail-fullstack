/**
 * VibeMail sample data (Phase 1). Plain data, no logic: every message is a CONTRACT.md §3.4
 * MessageDTO and every draft a §3.7 DraftDTO, exactly as the engine would return them, with
 * `status`, `isRead` and `isStarred` already derived from `labelIds`.
 *
 * Timestamps are fixed around SAMPLE_NOW; src/api/sampleSource.ts shifts them on load so
 * relative times read as recent. Keep this file intact: the sample source copies it and never
 * writes to it.
 */

export const SAMPLE_NOW = '2026-10-12T05:00:00.000Z';

/** The signed-in account in sample mode. */
export const SAMPLE_ACCOUNT = { email: 'you@vibemail.example' };

/** The 50-newest page the inbox lists: eight under All, one in Trash. */
export const messages = [
  {
    "gmailId": "m1",
    "threadId": "offsite",
    "labelIds": [
      "INBOX",
      "UNREAD",
      "Label_12"
    ],
    "status": "inbox",
    "isRead": false,
    "isStarred": false,
    "snippet": "Moved the retro to Thursday so ops can join. Everything else stays.",
    "historyId": "1001",
    "internalDate": "2026-10-12T04:48:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Offsite agenda, v3",
    "fromAddress": "Lena Ortiz <lena@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Moved the retro to Thursday so ops can join. Everything else stays.\n\nDay 1: planning, 9:30 start\nDay 2: retro + roadmap\n\nLena",
    "bodyHtml": null,
    "attachments": [
      {
        "partId": "offsite-agenda-v3.pdf",
        "filename": "offsite-agenda-v3.pdf",
        "mimeType": "application/pdf",
        "size": 88000,
        "attachmentId": "a-offsite-agenda-v3.pdf"
      }
    ],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m2",
    "threadId": "contract",
    "labelIds": [
      "INBOX",
      "UNREAD",
      "STARRED"
    ],
    "status": "inbox",
    "isRead": false,
    "isStarred": true,
    "snippet": "Two small changes in clause 7, otherwise fine. Happy to sign Thursday.",
    "historyId": "1002",
    "internalDate": "2026-10-12T04:12:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Re: Contract redlines",
    "fromAddress": "Marcus Hale <marcus@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [
      "legal@northwind.example"
    ],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Two small changes in clause 7, otherwise fine.\nHappy to sign Thursday.\n\n> On Mon, you wrote:\n> Thanks, will review tonight",
    "bodyHtml": null,
    "attachments": [
      {
        "partId": "redlines-v4.pdf",
        "filename": "redlines-v4.pdf",
        "mimeType": "application/pdf",
        "size": 217000,
        "attachmentId": "a-redlines-v4.pdf"
      }
    ],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m3",
    "threadId": "hiring",
    "labelIds": [
      "INBOX",
      "UNREAD"
    ],
    "status": "inbox",
    "isRead": false,
    "isStarred": false,
    "snippet": "Can you take the systems interview at 2? Strong infra background.",
    "historyId": "1003",
    "internalDate": "2026-10-12T03:55:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Hiring loop — Friday",
    "fromAddress": "Dana Kim <dana@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Can you take the systems interview at 2? The candidate has a strong infra background, so go deep on queues.\n\nDana",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m4",
    "threadId": "nightly",
    "labelIds": [
      "INBOX",
      "STARRED"
    ],
    "status": "inbox",
    "isRead": true,
    "isStarred": true,
    "snippet": "All 412 checks green on main · 11m 32s",
    "historyId": "1004",
    "internalDate": "2026-10-12T02:50:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Nightly passed",
    "fromAddress": "build-bot <ci@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "All 412 checks green on main.\nDuration: 11m 32s",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m5",
    "threadId": "budget",
    "labelIds": [
      "INBOX",
      "Label_7"
    ],
    "status": "inbox",
    "isRead": true,
    "isStarred": false,
    "snippet": "Final numbers attached for review. Please sign off by Wednesday.",
    "historyId": "1005",
    "internalDate": "2026-10-12T01:50:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Q3 budget sign-off",
    "fromAddress": "Finance Ops <finance@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Final Q3 numbers attached for review. Please sign off by Wednesday.\n\nFinance Ops",
    "bodyHtml": null,
    "attachments": [
      {
        "partId": "q3-budget-final.pdf",
        "filename": "q3-budget-final.pdf",
        "mimeType": "application/pdf",
        "size": 412000,
        "attachmentId": "a-q3-budget-final.pdf"
      }
    ],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m6",
    "threadId": "lunch",
    "labelIds": [
      "INBOX"
    ],
    "status": "inbox",
    "isRead": true,
    "isStarred": false,
    "snippet": "Thai place opened on 4th, want to try it Thursday at 12:30?",
    "historyId": "1006",
    "internalDate": "2026-10-12T00:40:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Lunch?",
    "fromAddress": "Priya N. <priya@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Thai place opened on 4th, want to try it Thursday at 12:30?",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m7",
    "threadId": "receipts",
    "labelIds": [
      "INBOX"
    ],
    "status": "inbox",
    "isRead": true,
    "isStarred": false,
    "snippet": "Here are the three from Lisbon. The taxi one is a bit blurry.",
    "historyId": "1007",
    "internalDate": "2026-10-11T04:00:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Trip receipts",
    "fromAddress": "Tomás Reyes <tomas@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Here are the three from Lisbon. The taxi one is a bit blurry, sorry.",
    "bodyHtml": null,
    "attachments": [
      {
        "partId": "hotel.pdf",
        "filename": "hotel.pdf",
        "mimeType": "application/pdf",
        "size": 54000,
        "attachmentId": "a-hotel.pdf"
      },
      {
        "partId": "taxi.pdf",
        "filename": "taxi.pdf",
        "mimeType": "application/pdf",
        "size": 31000,
        "attachmentId": "a-taxi.pdf"
      },
      {
        "partId": "dinner.pdf",
        "filename": "dinner.pdf",
        "mimeType": "application/pdf",
        "size": 29000,
        "attachmentId": "a-dinner.pdf"
      }
    ],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m8",
    "threadId": "status",
    "labelIds": [
      "INBOX",
      "Label_7"
    ],
    "status": "inbox",
    "isRead": true,
    "isStarred": false,
    "snippet": "Elevated p95 between 14:02 and 14:20 UTC, caused by a slow replica.",
    "historyId": "1008",
    "internalDate": "2026-10-10T04:40:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Resolved: API latency",
    "fromAddress": "Status Page <status@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Resolved. Elevated p95 latency between 14:02 and 14:20 UTC, caused by a slow replica.",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m9",
    "threadId": "promo",
    "labelIds": [
      "TRASH"
    ],
    "status": "trash",
    "isRead": true,
    "isStarred": false,
    "snippet": "20% off desk lamps this week",
    "historyId": "1009",
    "internalDate": "2026-10-05T14:40:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Your weekly picks",
    "fromAddress": "Deals Weekly <deals@shop.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "20% off desk lamps this week.",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  }
];

/** Earlier messages in two conversations: the thread view returns them, the list does not. */
export const earlierMessages = [
  {
    "gmailId": "m10",
    "threadId": "contract",
    "labelIds": [
      "Label_12"
    ],
    "status": "archived",
    "isRead": true,
    "isStarred": false,
    "snippet": "Sending over the redlined version, see clause 7",
    "historyId": "1010",
    "internalDate": "2026-10-09T05:20:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Contract redlines",
    "fromAddress": "Marcus Hale <marcus@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Hi,\n\nSending over the redlined version. The only real change is in clause 7: the termination notice goes from 30 to 45 days.\n\nMarcus",
    "bodyHtml": null,
    "attachments": [
      {
        "partId": "redlines-v3.pdf",
        "filename": "redlines-v3.pdf",
        "mimeType": "application/pdf",
        "size": 198000,
        "attachmentId": "a-redlines-v3.pdf"
      }
    ],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m11",
    "threadId": "contract",
    "labelIds": [
      "SENT"
    ],
    "status": "sent",
    "isRead": true,
    "isStarred": false,
    "snippet": "Thanks, will review tonight",
    "historyId": "1011",
    "internalDate": "2026-10-10T03:50:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Re: Contract redlines",
    "fromAddress": "You <you@vibemail.example>",
    "toAddress": [
      "Marcus Hale <marcus@northwind.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Thanks, will review tonight.",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m12",
    "threadId": "offsite",
    "labelIds": [
      "Label_12"
    ],
    "status": "archived",
    "isRead": true,
    "isStarred": false,
    "snippet": "First draft of the agenda: planning Wednesday, retro Thursday",
    "historyId": "1012",
    "internalDate": "2026-10-10T16:20:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Offsite agenda, v3",
    "fromAddress": "Lena Ortiz <lena@northwind.example>",
    "toAddress": [
      "You <you@vibemail.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "First draft of the agenda: planning on Wednesday, retro on Thursday. Comments welcome by Friday.\n\nLena",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  },
  {
    "gmailId": "m13",
    "threadId": "offsite",
    "labelIds": [
      "SENT"
    ],
    "status": "sent",
    "isRead": true,
    "isStarred": false,
    "snippet": "Can ops join the retro? They asked last time.",
    "historyId": "1013",
    "internalDate": "2026-10-11T05:40:00.000Z",
    "sizeEstimate": 4096,
    "subject": "Re: Offsite agenda, v3",
    "fromAddress": "You <you@vibemail.example>",
    "toAddress": [
      "Lena Ortiz <lena@northwind.example>"
    ],
    "ccAddresses": [],
    "bccAddresses": [],
    "rfc822MessageId": null,
    "inReplyTo": null,
    "references": null,
    "dateHeader": null,
    "bodyPlain": "Can ops join the retro? They asked last time.",
    "bodyHtml": null,
    "attachments": [],
    "syncedAt": "2026-10-12T04:58:00.000Z"
  }
];

/** Drafts already in Gmail: a reply in a stored thread, a new message, one barely started. */
export const drafts = [
  {
    "draftId": "r-seed-1",
    "gmailId": "ds1",
    "threadId": "contract",
    "to": [
      "Marcus Hale <marcus@northwind.example>"
    ],
    "subject": "Re: Contract redlines",
    "body": "Both changes look fine to me. I will sign once legal confirms clause 7.\n\nOn Sun, Oct 11, 2026, Marcus Hale wrote:\n> Two small changes on page 4.",
    "updatedAt": "2026-10-12T04:35:00.000Z"
  },
  {
    "draftId": "r-seed-2",
    "gmailId": "ds2",
    "threadId": "gmail-new-2",
    "to": [
      "team@northwind.example"
    ],
    "subject": "Q4 planning kickoff",
    "body": "Hi all, proposing we meet Thursday to set Q4 goals. Agenda below.",
    "updatedAt": "2026-10-12T02:00:00.000Z"
  },
  {
    "draftId": "r-seed-3",
    "gmailId": "ds3",
    "threadId": "gmail-new-3",
    "to": [],
    "subject": "",
    "body": "Notes for the retro: what went well",
    "updatedAt": "2026-10-11T03:00:00.000Z"
  }
];
