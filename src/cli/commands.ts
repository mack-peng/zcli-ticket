import * as z from 'zod';
import { declareCommand } from './command';
import type { AnyCommandSchema } from './command';

const numberArg = z.preprocess((val, ctx) => {
  const number = Number(val);
  if (Number.isNaN(number)) {
    ctx.addIssue({ code: 'custom', message: `expected number, received '${val}'` });
  }
  return number;
}, z.number());

const stringArrayArg = z.union([z.string(), z.array(z.string())]).transform(v => Array.isArray(v) ? v : [v]);

// ── Tickets ──

const ticketList = declareCommand({
  name: 'ticket-list',
  category: 'tickets',
  description: 'List all tickets',
  options: z.object({
    'sort-by': z.enum(['created_at','updated_at','priority','status']).optional().describe('sort by field'),
    'sort-order': z.enum(['asc','desc']).optional().describe('sort direction (asc, desc)'),
    status: z.enum(['new','open','pending','hold','solved','closed']).optional().describe('filter by ticket status'),
    'per-page': numberArg.optional().describe('tickets per page (max 100)'),
  }),
  api: { method: 'GET', path: '/api/v2/tickets' },
  transformRequest: ({ 'sort-by': sortBy, 'sort-order': sortOrder, 'per-page': perPage, status, ...rest }) => ({
    ...rest,
    ...(sortBy ? { sort_by: sortBy } : {}),
    ...(sortOrder ? { sort_order: sortOrder } : {}),
    ...(perPage ? { per_page: perPage } : {}),
    ...(status ? { status } : {}),
  }),
  list: true,
});

const ticketListRecent = declareCommand({
  name: 'ticket-list-recent',
  category: 'tickets',
  description: 'List recently updated tickets',
  api: { method: 'GET', path: '/api/v2/tickets/recent' },
  list: true,
});

const ticketShow = declareCommand({
  name: 'ticket-show',
  category: 'tickets',
  description: 'Show a single ticket',
  args: z.object({ id: numberArg.describe('Ticket ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/tickets/${id}` },
  transformResponse: (data: any) => data.ticket,
});

const ticketShowMany = declareCommand({
  name: 'ticket-show-many',
  category: 'tickets',
  description: 'Show multiple tickets by ID',
  args: z.object({ ids: z.string().describe('Comma-separated ticket IDs') }),
  api: { method: 'GET', path: ({ ids }) => `/api/v2/tickets/show_many.json?ids=${ids}` },
  transformResponse: (data: any) => data.tickets,
});

const ticketCreate = declareCommand({
  name: 'ticket-create',
  category: 'tickets',
  description: 'Create a new ticket',
  args: z.object({
    subject: z.string().describe('Ticket subject'),
    body: z.string().describe('Comment body'),
  }),
  options: z.object({
    priority: z.enum(['urgent','high','normal','low']).optional().describe('ticket priority'),
    type: z.string().optional().describe('ticket type'),
    tags: z.string().optional().describe('Comma-separated tags'),
    'assignee-id': numberArg.optional().describe('assignee user ID'),
    'group-id': numberArg.optional().describe('group ID'),
    'requester-id': numberArg.optional().describe('requester user ID'),
    status: z.enum(['new','open','pending','hold','solved','closed']).optional().describe('ticket status'),
  }),
  api: { method: 'POST', path: '/api/v2/tickets' },
  transformRequest: ({ subject, body, priority, type, tags, 'assignee-id': assigneeId, 'group-id': groupId, 'requester-id': requesterId, status }) => ({
    ticket: {
      subject,
      comment: { body },
      ...(priority ? { priority } : {}),
      ...(type ? { type } : {}),
      ...(tags ? { tags: tags.split(',') } : {}),
      ...(assigneeId ? { assignee_id: assigneeId } : {}),
      ...(groupId ? { group_id: groupId } : {}),
      ...(requesterId ? { requester_id: requesterId } : {}),
      ...(status ? { status } : {}),
    },
  }),
  transformResponse: (data: any) => data.ticket,
});

const ticketCreateMany = declareCommand({
  name: 'ticket-create-many',
  category: 'tickets',
  description: 'Bulk create tickets (up to 100)',
  args: z.object({
    file: z.string().describe('JSON file with tickets array'),
  }),
  jsonFile: true,
  api: { method: 'POST', path: '/api/v2/tickets/create_many' },
  transformRequest: (data: any) => Array.isArray(data) ? { tickets: data } : data,
  transformResponse: (data: any) => data.job_status,
});

const ticketUpdate = declareCommand({
  name: 'ticket-update',
  category: 'tickets',
  description: 'Update a ticket',
  args: z.object({ id: numberArg.describe('Ticket ID') }),
  options: z.object({
    subject: z.string().optional().describe('new subject'),
    priority: z.enum(['urgent','high','normal','low']).optional().describe('ticket priority'),
    status: z.enum(['new','open','pending','hold','solved','closed']).optional().describe('ticket status'),
    'assignee-id': numberArg.optional().describe('assignee user ID'),
    'group-id': numberArg.optional().describe('group ID'),
    tags: z.string().optional().describe('comma-separated tags'),
    comment: z.string().optional().describe('Add a public comment'),
    'private-comment': z.string().optional().describe('Add an internal note'),
  }),
  api: { method: 'PUT', path: ({ id }) => `/api/v2/tickets/${id}` },
  transformRequest: ({ subject, priority, status, 'assignee-id': assigneeId, 'group-id': groupId, tags, comment, 'private-comment': privateComment, id, ...rest }) => {
    const ticket: Record<string, any> = {};
    if (subject) ticket.subject = subject;
    if (priority) ticket.priority = priority;
    if (status) ticket.status = status;
    if (assigneeId) ticket.assignee_id = assigneeId;
    if (groupId) ticket.group_id = groupId;
    if (tags) ticket.tags = tags.split(',');

    if (comment) {
      ticket.comment = { body: comment, public: true };
    } else if (privateComment) {
      ticket.comment = { body: privateComment, public: false };
    }

    return { ticket };
  },
  transformResponse: (data: any) => data.ticket,
});

const ticketUpdateMany = declareCommand({
  name: 'ticket-update-many',
  category: 'tickets',
  description: 'Update multiple tickets',
  args: z.object({ ids: z.string().describe('Comma-separated ticket IDs') }),
  options: z.object({
    status: z.enum(['new','open','pending','hold','solved','closed']).optional(),
    'assignee-id': numberArg.optional(),
    'group-id': numberArg.optional(),
  }),
  api: { method: 'PUT', path: '/api/v2/tickets/update_many' },
  transformRequest: ({ ids, status, 'assignee-id': assigneeId, 'group-id': groupId }) => ({
    ticket_ids: ids.split(',').map(Number),
    ticket: {
      ...(status ? { status } : {}),
      ...(assigneeId ? { assignee_id: assigneeId } : {}),
      ...(groupId ? { group_id: groupId } : {}),
    },
  }),
});

const ticketDelete = declareCommand({
  name: 'ticket-delete',
  category: 'tickets',
  description: 'Delete a ticket',
  args: z.object({ id: numberArg.describe('Ticket ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/tickets/${id}` },
});

const ticketDeleteMany = declareCommand({
  name: 'ticket-delete-many',
  category: 'tickets',
  description: 'Delete multiple tickets',
  args: z.object({ ids: z.string().describe('Comma-separated ticket IDs') }),
  api: { method: 'DELETE', path: ({ ids }) => `/api/v2/tickets/destroy_many.json?ids=${ids}` },
});

const ticketMerge = declareCommand({
  name: 'ticket-merge',
  category: 'tickets',
  description: 'Merge tickets into a target ticket',
  args: z.object({
    id: numberArg.describe('Source ticket ID'),
    'target-id': numberArg.describe('Target ticket ID'),
  }),
  api: { method: 'POST', path: ({ id }) => `/api/v2/tickets/${id}/merge` },
  transformRequest: ({ id, 'target-id': targetId, ...rest }) => ({
    ids: [targetId],
    target_comment: 'Tickets merged',
    source_comment: 'Ticket merged into ' + targetId,
  }),
});

const ticketRelated = declareCommand({
  name: 'ticket-related',
  category: 'tickets',
  description: 'List related ticket information',
  args: z.object({ id: numberArg.describe('Ticket ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/tickets/${id}/related` },
  transformResponse: (data: any) => data.ticket_related,
});

// ── Comments ──

const commentList = declareCommand({
  name: 'comment-list',
  category: 'comments',
  description: 'List comments for a ticket',
  args: z.object({ 'ticket-id': numberArg.describe('Ticket ID') }),
  api: { method: 'GET', path: ({ 'ticket-id': ticketId }) => `/api/v2/tickets/${ticketId}/comments` },
  transformResponse: (data: any) => data.comments,
  list: true,
});

const commentCreate = declareCommand({
  name: 'comment-create',
  category: 'comments',
  description: 'Add a comment to a ticket',
  args: z.object({
    'ticket-id': numberArg.describe('Ticket ID'),
    body: z.string().describe('Comment body'),
  }),
  options: z.object({
    public: z.boolean().optional().describe('Make comment public (default)'),
    private: z.boolean().optional().describe('Make comment internal note'),
    'upload-tokens': z.string().optional().describe('Comma-separated attachment upload tokens'),
  }),
  api: { method: 'PUT', path: ({ 'ticket-id': ticketId }) => `/api/v2/tickets/${ticketId}` },
  transformRequest: ({ 'ticket-id': ticketId, body, public: isPublic, private: isPrivate, 'upload-tokens': uploadTokens }) => ({
    ticket: {
      comment: {
        body,
        public: isPrivate ? false : true,
        ...(uploadTokens ? { uploads: uploadTokens.split(',') } : {}),
      },
    },
  }),
  transformResponse: (data: any) => data.ticket,
});

const commentUpdate = declareCommand({
  name: 'comment-update',
  category: 'comments',
  description: 'Update a comment (make private only)',
  args: z.object({
    'ticket-id': numberArg.describe('Ticket ID'),
    'comment-id': numberArg.describe('Comment ID'),
    body: z.string().describe('New comment body'),
  }),
  api: { method: 'PUT', path: ({ 'ticket-id': ticketId, 'comment-id': commentId }) =>
    `/api/v2/tickets/${ticketId}/comments/${commentId}` },
  transformRequest: ({ body }) => ({ comment: { body } }),
});

const commentRedact = declareCommand({
  name: 'comment-redact',
  category: 'comments',
  description: 'Redact a comment\'s text from ticket',
  args: z.object({
    'ticket-id': numberArg.describe('Ticket ID'),
    'comment-id': numberArg.describe('Comment ID'),
    text: z.string().describe('Text to replace redacted content with'),
  }),
  api: { method: 'PUT', path: ({ 'ticket-id': ticketId, 'comment-id': commentId }) =>
    `/api/v2/tickets/${ticketId}/comments/${commentId}/redact` },
  transformRequest: ({ text }) => ({ text }),
});

const commentDelete = declareCommand({
  name: 'comment-delete',
  category: 'comments',
  description: 'Delete a comment from a ticket',
  args: z.object({
    'ticket-id': numberArg.describe('Ticket ID'),
    'comment-id': numberArg.describe('Comment ID'),
  }),
  api: { method: 'DELETE', path: ({ 'ticket-id': ticketId, 'comment-id': commentId }) =>
    `/api/v2/tickets/${ticketId}/comments/${commentId}` },
});

// ── Users ──

const userList = declareCommand({
  name: 'user-list',
  category: 'users',
  description: 'List all users',
  options: z.object({
    role: z.enum(['end-user','agent','admin']).optional().describe('user role'),
    'per-page': numberArg.optional().describe('users per page'),
  }),
  api: { method: 'GET', path: '/api/v2/users' },
  transformRequest: ({ role, 'per-page': perPage, ...rest }) => ({
    ...rest,
    ...(role ? { role } : {}),
    ...(perPage ? { per_page: perPage } : {}),
  }),
  list: true,
});

const userShow = declareCommand({
  name: 'user-show',
  category: 'users',
  description: 'Show a single user',
  args: z.object({ id: z.union([numberArg, z.string()]).describe('User ID or "me"') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/users/${id}` },
  transformResponse: (data: any) => data.user,
});

const userMe = declareCommand({
  name: 'user-me',
  category: 'users',
  description: 'Show the currently authenticated user',
  api: { method: 'GET', path: '/api/v2/users/me' },
  transformResponse: (data: any) => data.user,
});

const userShowMany = declareCommand({
  name: 'user-show-many',
  category: 'users',
  description: 'Show multiple users by ID',
  args: z.object({ ids: z.string().describe('Comma-separated user IDs') }),
  api: { method: 'GET', path: ({ ids }) => `/api/v2/users/show_many.json?ids=${ids}` },
  transformResponse: (data: any) => data.users,
});

const userCreate = declareCommand({
  name: 'user-create',
  category: 'users',
  description: 'Create a new user',
  args: z.object({
    name: z.string().describe('User name'),
    email: z.string().describe('User email'),
  }),
  options: z.object({
    role: z.enum(['end-user','agent','admin']).optional().describe('user role'),
    verified: z.boolean().optional().describe('mark as verified'),
    'organization-id': numberArg.optional().describe('organization ID'),
    phone: z.string().optional().describe('phone number'),
    locale: z.string().optional().describe('locale, e.g. en-US'),
  }),
  api: { method: 'POST', path: '/api/v2/users' },
  transformRequest: ({ name: userName, email, role, verified, 'organization-id': orgId, phone, locale }) => ({
    user: {
      name: userName,
      email,
      ...(role ? { role } : {}),
      ...(verified !== undefined ? { verified } : {}),
      ...(orgId ? { organization_id: orgId } : {}),
      ...(phone ? { phone } : {}),
      ...(locale ? { locale } : {}),
    },
  }),
  transformResponse: (data: any) => data.user,
});

const userCreateMany = declareCommand({
  name: 'user-create-many',
  category: 'users',
  description: 'Bulk create users (up to 100)',
  args: z.object({
    file: z.string().describe('JSON file with users array'),
  }),
  jsonFile: true,
  api: { method: 'POST', path: '/api/v2/users/create_many' },
  transformRequest: (data: any) => Array.isArray(data) ? { users: data } : data,
  transformResponse: (data: any) => data.job_status,
});

const userUpdate = declareCommand({
  name: 'user-update',
  category: 'users',
  description: 'Update a user',
  args: z.object({ id: numberArg.describe('User ID') }),
  options: z.object({
    name: z.string().optional().describe('display name'),
    email: z.string().optional().describe('email address'),
    role: z.enum(['end-user','agent','admin']).optional().describe('user role'),
    'organization-id': numberArg.optional().describe('organization ID'),
    phone: z.string().optional().describe('phone number'),
    locale: z.string().optional().describe('locale, e.g. en-US'),
    verified: z.boolean().optional().describe('mark as verified'),
  }),
  api: { method: 'PUT', path: ({ id }) => `/api/v2/users/${id}` },
  transformRequest: ({ id, name: userName, email, role, 'organization-id': orgId, phone, locale, verified }) => {
    const user: Record<string, any> = {};
    if (userName) user.name = userName;
    if (email) user.email = email;
    if (role) user.role = role;
    if (orgId) user.organization_id = orgId;
    if (phone) user.phone = phone;
    if (locale) user.locale = locale;
    if (verified !== undefined) user.verified = verified;
    return { user };
  },
  transformResponse: (data: any) => data.user,
});

const userUpdateMany = declareCommand({
  name: 'user-update-many',
  category: 'users',
  description: 'Bulk update users',
  args: z.object({ ids: z.string().describe('Comma-separated user IDs') }),
  options: z.object({
    name: z.string().optional().describe('display name'),
    email: z.string().optional().describe('email address'),
    role: z.enum(['end-user','agent','admin']).optional().describe('user role'),
    'organization-id': numberArg.optional().describe('organization ID'),
    verified: z.boolean().optional().describe('mark as verified'),
    suspended: z.boolean().optional().describe('suspend users'),
  }),
  api: { method: 'PUT', path: ({ ids }) => `/api/v2/users/update_many?ids=${ids}` },
  transformRequest: ({ ids, name, email, role, 'organization-id': orgId, verified, suspended }) => {
    const user: Record<string, any> = {};
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (orgId) user.organization_id = orgId;
    if (verified !== undefined) user.verified = verified;
    if (suspended !== undefined) user.suspended = suspended;
    return { user };
  },
  transformResponse: (data: any) => data.job_status,
});

const userDelete = declareCommand({
  name: 'user-delete',
  category: 'users',
  description: 'Delete a user',
  args: z.object({ id: numberArg.describe('User ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/users/${id}` },
});

const userDeleteMany = declareCommand({
  name: 'user-delete-many',
  category: 'users',
  description: 'Bulk delete users',
  args: z.object({ ids: z.string().describe('Comma-separated user IDs') }),
  api: { method: 'DELETE', path: ({ ids }) => `/api/v2/users/destroy_many?ids=${ids}` },
  transformResponse: (data: any) => data.job_status,
});

const userMerge = declareCommand({
  name: 'user-merge',
  category: 'users',
  description: 'Merge a user into another',
  args: z.object({
    'source-id': numberArg.describe('Source user ID (merged from)'),
    'target-id': numberArg.describe('Target user ID (merged into)'),
  }),
  api: { method: 'PUT', path: ({ 'source-id': sourceId }) => `/api/v2/users/${sourceId}/merge` },
  transformRequest: ({ 'source-id': sourceId, 'target-id': targetId }) => ({
    user: { id: targetId },
  }),
});

const userSearch = declareCommand({
  name: 'user-search',
  category: 'users',
  description: 'Search users by external_id, email, or query',
  options: z.object({
    query: z.string().optional().describe('Search query'),
    'external-id': z.string().optional(),
    email: z.string().optional(),
    'per-page': numberArg.optional(),
  }),
  api: { method: 'GET', path: '/api/v2/users/search' },
  list: true,
});

const userAutocomplete = declareCommand({
  name: 'user-autocomplete',
  category: 'users',
  description: 'Autocomplete user names',
  args: z.object({ name: z.string().describe('Name prefix to search') }),
  api: { method: 'GET', path: '/api/v2/users/autocomplete' },
  transformResponse: (data: any) => data.users,
});

// ── Organizations ──

const orgList = declareCommand({
  name: 'org-list',
  category: 'organizations',
  description: 'List all organizations',
  options: z.object({
    'per-page': numberArg.optional(),
  }),
  api: { method: 'GET', path: '/api/v2/organizations' },
  list: true,
});

const orgShow = declareCommand({
  name: 'org-show',
  category: 'organizations',
  description: 'Show a single organization',
  args: z.object({ id: numberArg.describe('Organization ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/organizations/${id}` },
  transformResponse: (data: any) => data.organization,
});

const orgCreate = declareCommand({
  name: 'org-create',
  category: 'organizations',
  description: 'Create an organization',
  args: z.object({ name: z.string().describe('Organization name') }),
  options: z.object({
    'external-id': z.string().optional(),
    'group-id': numberArg.optional(),
    tags: z.string().optional().describe('Comma-separated tags'),
    notes: z.string().optional(),
  }),
  api: { method: 'POST', path: '/api/v2/organizations' },
  transformRequest: ({ name, 'external-id': externalId, 'group-id': groupId, tags, notes }) => ({
    organization: {
      name,
      ...(externalId ? { external_id: externalId } : {}),
      ...(groupId ? { group_id: groupId } : {}),
      ...(tags ? { tags: tags.split(',') } : {}),
      ...(notes ? { notes } : {}),
    },
  }),
  transformResponse: (data: any) => data.organization,
});

const orgUpdate = declareCommand({
  name: 'org-update',
  category: 'organizations',
  description: 'Update an organization',
  args: z.object({ id: numberArg.describe('Organization ID') }),
  options: z.object({
    name: z.string().optional(),
    'external-id': z.string().optional(),
    tags: z.string().optional(),
    notes: z.string().optional(),
  }),
  api: { method: 'PUT', path: ({ id }) => `/api/v2/organizations/${id}` },
  transformRequest: ({ id, name, 'external-id': externalId, tags, notes }) => {
    const org: Record<string, any> = {};
    if (name) org.name = name;
    if (externalId) org.external_id = externalId;
    if (tags) org.tags = tags.split(',');
    if (notes) org.notes = notes;
    return { organization: org };
  },
  transformResponse: (data: any) => data.organization,
});

const orgDelete = declareCommand({
  name: 'org-delete',
  category: 'organizations',
  description: 'Delete an organization',
  args: z.object({ id: numberArg.describe('Organization ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/organizations/${id}` },
});

const orgSearch = declareCommand({
  name: 'org-search',
  category: 'organizations',
  description: 'Search organizations by external_id',
  args: z.object({ 'external-id': z.string().describe('External organization ID') }),
  api: { method: 'GET', path: '/api/v2/organizations/search' },
  transformResponse: (data: any) => data.organizations,
});

// ── Groups ──

const groupList = declareCommand({
  name: 'group-list',
  category: 'groups',
  description: 'List all groups',
  api: { method: 'GET', path: '/api/v2/groups' },
  transformResponse: (data: any) => data.groups,
  list: true,
});

const groupShow = declareCommand({
  name: 'group-show',
  category: 'groups',
  description: 'Show a single group',
  args: z.object({ id: numberArg.describe('Group ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/groups/${id}` },
  transformResponse: (data: any) => data.group,
});

const groupCreate = declareCommand({
  name: 'group-create',
  category: 'groups',
  description: 'Create a group',
  args: z.object({ name: z.string().describe('Group name') }),
  api: { method: 'POST', path: '/api/v2/groups' },
  transformRequest: ({ name }) => ({ group: { name } }),
  transformResponse: (data: any) => data.group,
});

const groupUpdate = declareCommand({
  name: 'group-update',
  category: 'groups',
  description: 'Update a group',
  args: z.object({ id: numberArg.describe('Group ID') }),
  options: z.object({ name: z.string().optional() }),
  api: { method: 'PUT', path: ({ id }) => `/api/v2/groups/${id}` },
  transformRequest: ({ id, name }) => ({ group: { ...(name ? { name } : {}) } }),
  transformResponse: (data: any) => data.group,
});

const groupDelete = declareCommand({
  name: 'group-delete',
  category: 'groups',
  description: 'Delete a group',
  args: z.object({ id: numberArg.describe('Group ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/groups/${id}` },
});

// ── Search ──

const search = declareCommand({
  name: 'search',
  category: 'search',
  description: 'Search tickets, users, or organizations (Zendesk search syntax)',
  args: z.object({ query: z.string().describe('Search query') }),
  options: z.object({
    type: z.enum(['ticket','user','organization']).optional().describe('Result type'),
    'sort-by': z.enum(['created_at','updated_at','priority','status']).optional().describe('sort by field'),
    'sort-order': z.enum(['asc','desc']).optional().describe('sort direction'),
    'per-page': numberArg.optional().describe('results per page'),
  }),
  api: { method: 'GET', path: '/api/v2/search' },
  transformRequest: ({ query, type, 'sort-by': sortBy, 'sort-order': sortOrder, 'per-page': perPage }) => {
    const typeQuery = type ? `type:${type} ` : '';
    return {
      query: typeQuery + query,
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(sortOrder ? { sort_order: sortOrder } : {}),
      ...(perPage ? { per_page: perPage } : {}),
    };
  },
  transformResponse: (data: any) => data.results,
  list: true,
});

// ── Views ──

const viewList = declareCommand({
  name: 'view-list',
  category: 'views',
  description: 'List all views',
  api: { method: 'GET', path: '/api/v2/views' },
  transformResponse: (data: any) => data.views,
});

const viewShow = declareCommand({
  name: 'view-show',
  category: 'views',
  description: 'Show a view',
  args: z.object({ id: numberArg.describe('View ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/views/${id}` },
  transformResponse: (data: any) => data.view,
});

const viewExecute = declareCommand({
  name: 'view-execute',
  category: 'views',
  description: 'Execute a view (get tickets)',
  args: z.object({ id: numberArg.describe('View ID') }),
  options: z.object({
    'sort-by': z.string().optional().describe('sort by field'),
    'sort-order': z.enum(['asc','desc']).optional().describe('sort direction'),
    'per-page': numberArg.optional().describe('tickets per page'),
  }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/views/${id}/execute` },
  transformResponse: (data: any) => data.rows || data.tickets,
  list: true,
});

const viewCount = declareCommand({
  name: 'view-count',
  category: 'views',
  description: 'Count tickets in a view',
  args: z.object({ id: numberArg.describe('View ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/views/${id}/count` },
  transformResponse: (data: any) => data.view_count,
});

const viewCountMany = declareCommand({
  name: 'view-count-many',
  category: 'views',
  description: 'Count tickets in multiple views',
  args: z.object({ ids: z.string().describe('Comma-separated view IDs') }),
  api: { method: 'GET', path: ({ ids }) => `/api/v2/views/count_many.json?ids=${ids}` },
  transformResponse: (data: any) => data.view_counts,
});

// ── Attachments ──

const attachmentShow = declareCommand({
  name: 'attachment-show',
  category: 'tickets',
  description: 'Show attachment metadata',
  args: z.object({ id: numberArg.describe('Attachment ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/attachments/${id}` },
  transformResponse: (data: any) => data.attachment,
});

const attachmentUpload = declareCommand({
  name: 'attachment-upload',
  category: 'tickets',
  description: 'Upload a file attachment',
  args: z.object({
    file: z.string().describe('Path to file to upload'),
  }),
  options: z.object({
    filename: z.string().optional().describe('Override filename'),
    token: z.boolean().optional().describe('Return only upload token'),
  }),
  api: { method: 'POST', path: '/api/v2/uploads' },
  transformRequest: ({ file: filePath, filename: fileName }) => ({
    file: filePath,
    ...(fileName ? { filename: fileName } : {}),
  }),
});

const attachmentDelete = declareCommand({
  name: 'attachment-delete',
  category: 'tickets',
  description: 'Delete an attachment',
  args: z.object({ id: numberArg.describe('Attachment ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/attachments/${id}` },
});

// ── Ticket Fields ──

const ticketFieldList = declareCommand({
  name: 'ticket-field-list',
  category: 'tickets',
  description: 'List all ticket fields',
  api: { method: 'GET', path: '/api/v2/ticket_fields' },
  transformResponse: (data: any) => data.ticket_fields,
});

const ticketFieldShow = declareCommand({
  name: 'ticket-field-show',
  category: 'tickets',
  description: 'Show a ticket field',
  args: z.object({ id: numberArg.describe('Field ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/ticket_fields/${id}` },
  transformResponse: (data: any) => data.ticket_field,
});

// ── Ticket Forms ──

const ticketFormList = declareCommand({
  name: 'ticket-form-list',
  category: 'tickets',
  description: 'List all ticket forms',
  api: { method: 'GET', path: '/api/v2/ticket_forms' },
  transformResponse: (data: any) => data.ticket_forms,
});

const ticketFormShow = declareCommand({
  name: 'ticket-form-show',
  category: 'tickets',
  description: 'Show a ticket form',
  args: z.object({ id: numberArg.describe('Form ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/ticket_forms/${id}` },
  transformResponse: (data: any) => data.ticket_form,
});

// ── Tags ──

const tagList = declareCommand({
  name: 'tag-list',
  category: 'tickets',
  description: 'List all tags',
  api: { method: 'GET', path: '/api/v2/tags' },
  transformResponse: (data: any) => data.tags,
});

// ── Macros ──

const macroList = declareCommand({
  name: 'macro-list',
  category: 'tickets',
  description: 'List all macros',
  api: { method: 'GET', path: '/api/v2/macros' },
  transformResponse: (data: any) => data.macros,
});

const macroShow = declareCommand({
  name: 'macro-show',
  category: 'tickets',
  description: 'Show a macro',
  args: z.object({ id: numberArg.describe('Macro ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/macros/${id}` },
  transformResponse: (data: any) => data.macro,
});

const macroApply = declareCommand({
  name: 'macro-apply',
  category: 'tickets',
  description: 'Apply a macro to a ticket',
  args: z.object({
    'ticket-id': numberArg.describe('Ticket ID'),
    'macro-id': numberArg.describe('Macro ID'),
  }),
  api: { method: 'PUT', path: ({ 'ticket-id': ticketId, 'macro-id': macroId }) => `/api/v2/tickets/${ticketId}/macros/${macroId}/apply` },
  transformRequest: ({ 'ticket-id': ticketId, 'macro-id': macroId }) => ({ macro_id: macroId }),
});

// ── Suspended Tickets ──

const suspendedList = declareCommand({
  name: 'suspended-list',
  category: 'tickets',
  description: 'List suspended tickets',
  api: { method: 'GET', path: '/api/v2/suspended_tickets' },
  transformResponse: (data: any) => data.suspended_tickets,
  list: true,
});

const suspendedRecover = declareCommand({
  name: 'suspended-recover',
  category: 'tickets',
  description: 'Recover a suspended ticket',
  args: z.object({ id: numberArg.describe('Suspended ticket ID') }),
  api: { method: 'PUT', path: ({ id }) => `/api/v2/suspended_tickets/${id}/recover` },
  transformResponse: (data: any) => data.ticket,
});

const suspendedDelete = declareCommand({
  name: 'suspended-delete',
  category: 'tickets',
  description: 'Delete a suspended ticket',
  args: z.object({ id: numberArg.describe('Suspended ticket ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/suspended_tickets/${id}` },
});

// ── Incremental Exports ──

const incrementalTickets = declareCommand({
  name: 'incremental-tickets',
  category: 'tickets',
  description: 'Incrementally export tickets',
  args: z.object({ 'start-time': numberArg.describe('Unix timestamp start') }),
  api: { method: 'GET', path: '/api/v2/incremental/tickets' },
  list: true,
});

const incrementalUsers = declareCommand({
  name: 'incremental-users',
  category: 'users',
  description: 'Incrementally export users',
  args: z.object({ 'start-time': numberArg.describe('Unix timestamp start') }),
  api: { method: 'GET', path: '/api/v2/incremental/users' },
  list: true,
});

const incrementalOrgs = declareCommand({
  name: 'incremental-orgs',
  category: 'organizations',
  description: 'Incrementally export organizations',
  args: z.object({ 'start-time': numberArg.describe('Unix timestamp start') }),
  api: { method: 'GET', path: '/api/v2/incremental/organizations' },
  list: true,
});

// ── User Identities ──

const identityList = declareCommand({
  name: 'identity-list',
  category: 'users',
  description: 'List identities for a user',
  args: z.object({ 'user-id': numberArg.describe('User ID') }),
  api: { method: 'GET', path: ({ 'user-id': userId }) => `/api/v2/users/${userId}/identities` },
  transformResponse: (data: any) => data.identities,
});

// ── Group Memberships ──

const groupMembershipList = declareCommand({
  name: 'group-membership-list',
  category: 'groups',
  description: 'List group memberships',
  options: z.object({ 'user-id': numberArg.optional(), 'group-id': numberArg.optional() }),
  api: { method: 'GET', path: '/api/v2/group_memberships' },
  transformResponse: (data: any) => data.group_memberships,
  list: true,
});

const groupMembershipCreate = declareCommand({
  name: 'group-membership-create',
  category: 'groups',
  description: 'Create a group membership',
  args: z.object({
    'user-id': numberArg.describe('User ID'),
    'group-id': numberArg.describe('Group ID'),
  }),
  api: { method: 'POST', path: '/api/v2/group_memberships' },
  transformRequest: ({ 'user-id': userId, 'group-id': groupId }) => ({
    group_membership: { user_id: userId, group_id: groupId },
  }),
  transformResponse: (data: any) => data.group_membership,
});

const groupMembershipDelete = declareCommand({
  name: 'group-membership-delete',
  category: 'groups',
  description: 'Delete a group membership',
  args: z.object({ id: numberArg.describe('Membership ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/group_memberships/${id}` },
});

// ── Organization Memberships ──

const orgMembershipList = declareCommand({
  name: 'org-membership-list',
  category: 'organizations',
  description: 'List organization memberships',
  options: z.object({ 'user-id': numberArg.optional(), 'org-id': numberArg.optional() }),
  api: { method: 'GET', path: '/api/v2/organization_memberships' },
  transformResponse: (data: any) => data.organization_memberships,
  list: true,
});

const orgMembershipCreate = declareCommand({
  name: 'org-membership-create',
  category: 'organizations',
  description: 'Create an organization membership',
  args: z.object({
    'user-id': numberArg.describe('User ID'),
    'org-id': numberArg.describe('Organization ID'),
  }),
  api: { method: 'POST', path: '/api/v2/organization_memberships' },
  transformRequest: ({ 'user-id': userId, 'org-id': orgId }) => ({
    organization_membership: { user_id: userId, organization_id: orgId },
  }),
  transformResponse: (data: any) => data.organization_membership,
});

const orgMembershipDelete = declareCommand({
  name: 'org-membership-delete',
  category: 'organizations',
  description: 'Delete an organization membership',
  args: z.object({ id: numberArg.describe('Membership ID') }),
  api: { method: 'DELETE', path: ({ id }) => `/api/v2/organization_memberships/${id}` },
});

// ── Config ──

const configShow = declareCommand({
  name: 'config-show',
  category: 'config',
  description: 'Show current configuration',
  api: { method: 'GET', path: '' },
});

const configSet = declareCommand({
  name: 'config-set',
  category: 'config',
  description: 'Set a configuration value',
  args: z.object({
    key: z.string().describe('Config key (subdomain, email, token, password, oauth-token)'),
    value: z.string().describe('Config value'),
  }),
  api: { method: 'GET', path: '' },
});

const configPath = declareCommand({
  name: 'config-path',
  category: 'config',
  description: 'Show configuration file path',
  api: { method: 'GET', path: '' },
});

const configList = declareCommand({
  name: 'config-list',
  category: 'config',
  description: 'List all profiles',
  api: { method: 'GET', path: '' },
});

const configUse = declareCommand({
  name: 'config-use',
  category: 'config',
  description: 'Switch active profile',
  args: z.object({
    name: z.string().describe('Profile name'),
  }),
  api: { method: 'GET', path: '' },
});

const configNew = declareCommand({
  name: 'config-new',
  category: 'config',
  description: 'Create a new profile',
  args: z.object({
    name: z.string().describe('Profile name'),
  }),
  api: { method: 'GET', path: '' },
});

const skillInstall = declareCommand({
  name: 'skill-install',
  category: 'config',
  description: 'Install Agent Skill for zcli-ticket',
  options: z.object({
    target: z.string().optional().describe('Agent target: auto, all, opencode, claude, codex, cursor, hermes, gemini (default: auto)'),
    path: z.string().optional().describe('Custom install directory (overrides agent auto-detection)'),
  }),
  api: { method: 'GET', path: '' },
});

const skillUninstall = declareCommand({
  name: 'skill-uninstall',
  category: 'config',
  description: 'Remove Agent Skill for zcli-ticket',
  options: z.object({
    target: z.string().optional().describe('Agent target: auto, all, opencode, claude, codex, cursor, hermes, gemini (default: auto)'),
    path: z.string().optional().describe('Custom install directory'),
  }),
  api: { method: 'GET', path: '' },
});

const ticketThread = declareCommand({
  name: 'ticket-thread',
  category: 'tickets',
  description: 'Show ticket with all comments',
  args: z.object({ id: numberArg.describe('Ticket ID') }),
  api: { method: 'GET', path: ({ id }) => `/api/v2/tickets/${id}` },
});

// ── Export ──

const commandsArray: AnyCommandSchema[] = [
  // tickets
  ticketList, ticketListRecent, ticketShow, ticketShowMany,
  ticketCreate, ticketCreateMany, ticketUpdate, ticketUpdateMany,
  ticketDelete, ticketDeleteMany, ticketMerge, ticketRelated, ticketThread,
  // attachments
  attachmentShow, attachmentUpload, attachmentDelete,
  // comments
  commentList, commentCreate, commentUpdate, commentRedact, commentDelete,
  // users
  userList, userShow, userMe, userShowMany, userCreate, userCreateMany,
  userUpdate, userUpdateMany, userDelete, userDeleteMany, userMerge, userSearch,
  userAutocomplete,
  identityList,
  incrementalUsers,
  // organizations
  orgList, orgShow, orgCreate, orgUpdate, orgDelete, orgSearch,
  orgMembershipList, orgMembershipCreate, orgMembershipDelete,
  incrementalOrgs,
  // groups
  groupList, groupShow, groupCreate, groupUpdate, groupDelete,
  groupMembershipList, groupMembershipCreate, groupMembershipDelete,
  // search
  search,
  // views
  viewList, viewShow, viewExecute, viewCount, viewCountMany,
  // ticket fields / forms
  ticketFieldList, ticketFieldShow,
  ticketFormList, ticketFormShow,
  // tags / macros
  tagList, macroList, macroShow, macroApply,
  // suspended / incremental
  suspendedList, suspendedRecover, suspendedDelete,
  incrementalTickets,
  // config
  configShow, configSet, configPath, configList, configUse, configNew,
  skillInstall, skillUninstall,
];

export const commands = Object.fromEntries(commandsArray.map(cmd => [cmd.name, cmd]));
