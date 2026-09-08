# Graph Report - clubchat  (2026-09-08)

## Corpus Check
- 163 files · ~88,271 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 775 nodes · 1567 edges · 70 communities (34 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 34,981 input · 1,540 output

## Community Hubs (Navigation)
- App Routing & Auth Bootstrap
- Event Scheduling UI
- Chat & Realtime Data Layer
- Core Database Schema & RLS
- Expo App Configuration
- Login & Shared UI Primitives
- Wiki Viewer & Dependencies
- Package Dependencies List
- Room & Club Workspace Screens
- Workspace Shell Navigation
- Club Members Screen
- Workspace Screen Logic & Profile
- Chat Message Components
- Club Management Screen
- Responsive Shell Layout
- Project Docs & Agent Specs
- Channel Invite Screen
- Channel Join Screen
- Profile Editing & Toast
- Wiki Page Data Model
- Join By Link Screen
- TypeScript Config
- Club List Pane
- Create Channel Screen
- Channel Management Actions
- Create Club Screen
- Join Club Screen
- Message Search Screen
- Member Management Actions
- Self-Host Auth Function
- Channel Manage QR/Invite
- Self-Host Key Generation
- RLS Recursion Fix
- Unread Counts Function
- Metro Bundler Config
- Self-Host Reset Script
- Self-Host Auth Key Rotation
- Push Notification Function
- Grants Fix Migration
- Profile Visibility RLS
- App Icon Asset
- Splash Icon Asset
- Reviewer Agent Spec
- Tester Agent Spec
- Events Table
- Join Request Memberships

## God Nodes (most connected - your core abstractions)
1. `react` - 60 edges
2. `react-native` - 57 edges
3. `expo-router` - 36 edges
4. `useAuth()` - 31 edges
5. `useToast()` - 31 edges
6. `supabase` - 31 edges
7. `Pressable()` - 24 edges
8. `useBreakpoint()` - 21 edges
9. `ChatScreen()` - 20 edges
10. `colors` - 18 edges

## Surprising Connections (you probably didn't know these)
- `handleToggleMemberType()` --calls--> `confirm()`  [EXTRACTED]
  app/(app)/clubs/members.tsx → src/features/ui/ConfirmDialog.tsx
- `AppLayout()` --calls--> `useBreakpoint()`  [EXTRACTED]
  app/(app)/_layout.tsx → src/features/shell/useBreakpoint.ts
- `ChatRoute()` --calls--> `useAuth()`  [EXTRACTED]
  app/(app)/channels/[id]/chat.tsx → src/features/auth/useAuth.ts
- `EventDetailPage()` --calls--> `useAuth()`  [EXTRACTED]
  app/(app)/channels/[id]/events/[eventId]/detail.tsx → src/features/auth/useAuth.ts
- `EventCreatePage()` --calls--> `useAuth()`  [EXTRACTED]
  app/(app)/channels/[id]/events/create.tsx → src/features/auth/useAuth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Agent Orchestration** — claude_agents_db_schema, claude_agents_ui_builder, claude_agents_realtime_chat, claude_agents_reviewer, claude_agents_tester [EXTRACTED 1.00]
- **Core Domain Entities** — db_profiles, db_clubs, db_memberships, db_channels, db_messages [EXTRACTED 1.00]

## Communities (70 total, 12 thin omitted)

### Community 0 - "App Routing & Auth Bootstrap"
Cohesion: 0.05
Nodes (41): ChatRoute(), EventCreatePage(), EventDetailPage(), EventListPage(), ApplyScreen(), CLUB_COLORS, ClubInfo, getClubColor() (+33 more)

### Community 1 - "Event Scheduling UI"
Cohesion: 0.06
Nodes (43): @react-native-community/datetimepicker, DatePickerField(), DatePickerFieldProps, styles, DatePickerField(), DatePickerFieldProps, toDateInputStr(), CountBarProps (+35 more)

### Community 2 - "Chat & Realtime Data Layer"
Cohesion: 0.08
Nodes (38): expo-document-picker, expo-file-system, expo-image-picker, @supabase/supabase-js, ChatMessageList(), Props, styles, ChatScreen() (+30 more)

### Community 3 - "Core Database Schema & RLS"
Cohesion: 0.06
Nodes (38): auth, auth.users, public.clubs, public.handle_new_user, public.profiles, attachments, channel_members, channel_reads (+30 more)

### Community 4 - "Expo App Configuration"
Cohesion: 0.04
Nodes (44): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+36 more)

### Community 5 - "Login & Shared UI Primitives"
Cohesion: 0.06
Nodes (32): expo-web-browser, react-native-safe-area-context, LoginScreen(), styles, createSessionFromUrl(), useGoogleAuth(), UseGoogleAuthReturn, ChatComposer() (+24 more)

### Community 6 - "Wiki Viewer & Dependencies"
Cohesion: 0.06
Nodes (31): devDependencies, @types/react, typescript, main, name, private, scripts, android (+23 more)

### Community 7 - "Package Dependencies List"
Cohesion: 0.06
Nodes (31): dependencies, expo, expo-auth-session, expo-camera, expo-clipboard, expo-constants, expo-crypto, expo-device (+23 more)

### Community 8 - "Room & Club Workspace Screens"
Cohesion: 0.15
Nodes (17): MemberRole, ROLE_LABEL, styles, styles, PaneHeader(), RoomListPane(), RoomListPaneProps, styles (+9 more)

### Community 9 - "Workspace Shell Navigation"
Cohesion: 0.17
Nodes (15): ClubAvatarButton(), RAIL_WIDTH, styles, UserAvatarMark(), JoinByCodeSheet(), RoomDetailPane(), RoomDetailPaneProps, styles (+7 more)

### Community 10 - "Club Members Screen"
Cohesion: 0.11
Nodes (20): AVATAR_COLORS, getAvatarColor(), MemberAvatar(), MemberRow, ProcessedMember, ROLE_COLOR, ROLE_LABEL, styles (+12 more)

### Community 11 - "Workspace Screen Logic & Profile"
Cohesion: 0.17
Nodes (11): WorkspaceClubScreen(), WorkspaceRoomScreen(), styles, WorkspaceIndexScreen(), useProfile(), IconRail(), ProfileEditSheet(), useWorkspaceData() (+3 more)

### Community 12 - "Chat Message Components"
Cohesion: 0.16
Nodes (17): Attachment, AttachmentMessage(), FileAttachment(), formatBytes(), ImageAttachment(), Props, styles, useSignedUrl() (+9 more)

### Community 13 - "Club Management Screen"
Cohesion: 0.15
Nodes (10): AVATAR_COLORS, ClubInfo, getAvatarColor(), JoinRequest, LoadState, ManageClubScreenContent(), confirmRegenerate(), handleRegenerate() (+2 more)

### Community 14 - "Responsive Shell Layout"
Cohesion: 0.17
Nodes (12): AppLayout(), WorkspaceLayout(), Pane(), PaneGroup(), PaneGroupProps, PaneProps, styles, ScreenOverlay() (+4 more)

### Community 15 - "Project Docs & Agent Specs"
Cohesion: 0.15
Nodes (12): db-schema Agent, realtime-chat Agent, ui-builder Agent, channels table, clubs table, event_responses table, events table, memberships table (+4 more)

### Community 16 - "Channel Invite Screen"
Cohesion: 0.17
Nodes (7): CreateInviteError, CreateInviteResult, CreateInviteSuccess, InviteScreenContent(), PageState, styles, buildInviteLink()

### Community 17 - "Channel Join Screen"
Cohesion: 0.20
Nodes (11): InviteFormState, JoinChannelError, JoinChannelResult, JoinChannelScreen(), handleJoinByInvite(), handleJoinByPassword(), JoinChannelSuccess, mapInviteError() (+3 more)

### Community 18 - "Profile Editing & Toast"
Cohesion: 0.20
Nodes (7): ProfileRow, UseProfileReturn, EMOJI_LIST, ProfileEditSheetProps, styles, styles, ToastProps

### Community 19 - "Wiki Page Data Model"
Cohesion: 0.33
Nodes (9): Page, PageScope, SavePagePayload, SavePageResult, UsePageResult, useUpsertPage(), UseUpsertPageResult, styles (+1 more)

### Community 20 - "Join By Link Screen"
Cohesion: 0.22
Nodes (10): JoinByLinkScreen(), fetchPreview(), goToChannel(), handleJoin(), mapPreviewError(), PageState, PreviewError, PreviewResult (+2 more)

### Community 21 - "TypeScript Config"
Cohesion: 0.18
Nodes (10): expo/tsconfig.base, compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, moduleResolution, paths, strict (+2 more)

### Community 22 - "Club List Pane"
Cohesion: 0.22
Nodes (8): ClubCard(), ClubListPane(), ClubListPaneProps, MemberRole, ROLE_COLOR, ROLE_LABEL, styles, WorkspaceClub

### Community 23 - "Create Channel Screen"
Cohesion: 0.25
Nodes (8): CreateChannelError, CreateChannelResult, CreateChannelScreen(), handleCreate(), CreateChannelSuccess, FormState, mapRpcError(), styles

### Community 24 - "Channel Management Actions"
Cohesion: 0.28
Nodes (5): ManageChannelScreenContent(), confirmRegenerate(), confirmRemovePassword(), handleRegenerate(), confirm()

### Community 25 - "Create Club Screen"
Cohesion: 0.22
Nodes (6): CreateClubError, CreateClubResult, CreateClubScreen(), CreateClubSuccess, FormState, styles

### Community 26 - "Join Club Screen"
Cohesion: 0.22
Nodes (7): ERROR_MESSAGES, FormState, JoinClubError, JoinClubResult, JoinClubScreen(), JoinClubSuccess, styles

### Community 27 - "Message Search Screen"
Cohesion: 0.29
Nodes (4): formatDatetime(), SearchResult, SearchScreenContent(), styles

### Community 28 - "Member Management Actions"
Cohesion: 0.25
Nodes (3): MembersScreenContent(), handleToggleMemberType(), useConfirm()

### Community 29 - "Self-Host Auth Function"
Cohesion: 0.38
Nodes (5): isValidHybridJWT(), isValidJWT(), isValidLegacyJWT(), JWT_SECRET, SUPABASE_URL

### Community 30 - "Channel Manage QR/Invite"
Cohesion: 0.33
Nodes (4): LoadState, styles, expo-clipboard, react-native-qrcode-svg

### Community 31 - "Self-Host Key Generation"
Cohesion: 0.60
Nodes (5): base64_url_encode(), gen_base64(), gen_hex(), gen_token(), generate-keys.sh script

### Community 32 - "RLS Recursion Fix"
Cohesion: 0.40
Nodes (5): public.is_channel_member(), public.is_club_admin(), public.is_club_member(), public.channel_members, public.memberships

### Community 33 - "Unread Counts Function"
Cohesion: 0.40
Nodes (4): public.channel_reads, public.messages, public.get_unread_counts(), public.channel_members

## Knowledge Gaps
- **252 isolated node(s):** `name`, `slug`, `version`, `runtimeVersion`, `scheme` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 380 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react-native` connect `App Routing & Auth Bootstrap` to `Event Scheduling UI`, `Chat & Realtime Data Layer`, `Login & Shared UI Primitives`, `Wiki Viewer & Dependencies`, `Room & Club Workspace Screens`, `Workspace Shell Navigation`, `Club Members Screen`, `Workspace Screen Logic & Profile`, `Chat Message Components`, `Club Management Screen`, `Responsive Shell Layout`, `Channel Invite Screen`, `Channel Join Screen`, `Profile Editing & Toast`, `Wiki Page Data Model`, `Join By Link Screen`, `Club List Pane`, `Create Channel Screen`, `Create Club Screen`, `Join Club Screen`, `Message Search Screen`, `Channel Manage QR/Invite`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `react` connect `App Routing & Auth Bootstrap` to `Event Scheduling UI`, `Chat & Realtime Data Layer`, `Login & Shared UI Primitives`, `Wiki Viewer & Dependencies`, `Room & Club Workspace Screens`, `Workspace Shell Navigation`, `Club Members Screen`, `Workspace Screen Logic & Profile`, `Chat Message Components`, `Club Management Screen`, `Responsive Shell Layout`, `Channel Invite Screen`, `Channel Join Screen`, `Profile Editing & Toast`, `Wiki Page Data Model`, `Join By Link Screen`, `Club List Pane`, `Create Channel Screen`, `Create Club Screen`, `Join Club Screen`, `Message Search Screen`, `Channel Manage QR/Invite`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package Dependencies List` to `Wiki Viewer & Dependencies`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _252 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Routing & Auth Bootstrap` be split into smaller, more focused modules?**
  _Cohesion score 0.054612054612054615 - nodes in this community are weakly interconnected._
- **Should `Event Scheduling UI` be split into smaller, more focused modules?**
  _Cohesion score 0.059227921734531994 - nodes in this community are weakly interconnected._
- **Should `Chat & Realtime Data Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.07686932215234102 - nodes in this community are weakly interconnected._