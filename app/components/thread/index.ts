/**
 * The thread view, split by responsibility:
 *
 *   ThreadView        loads GET /api/v1/threads/{threadId}; expand state; conversation actions
 *   ├─ ThreadHeader   back · read/unread toggle · conversation star · Archive / Trash menu
 *   ├─ ThreadSkeleton loading: skeleton title and cards, with the inbox's cached row
 *   └─ MessageCard    one message, collapsed to a line or expanded with body and Reply
 *      └─ Avatar      sender initials
 */
export { ThreadView } from '@/app/components/thread/ThreadView';
