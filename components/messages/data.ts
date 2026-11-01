// Messages screen - types, static content, helpers (koi UI nahi, isliye halka)

export type RowType = 'followers' | 'comments' | 'likes' | 'assistant' | 'official' | 'system';

export type MessageRow = {
  id: string;
  type: RowType;
  title: string;
  subtitle: string;
  time?: string;
  unread: number;
  verified?: boolean;
  route: string;
};

export type Room = {
  id: string;
  hostId: string | null;
  title: string;
  host: string;
  type: string;
  layout: string;
  users: number;
  cover: string;
  hostImg: string;
  guests: string[];
  isFamily: boolean;
  createdAt: number;
};

// Sirf ye 3 rows static hain. Followers / Comments / Likes Firestore se aate hain.
export const STATIC_ROWS: MessageRow[] = [
  {
    id: 'assistant',
    type: 'assistant',
    title: 'Creator Assistant',
    subtitle: 'Your data summary for the past week',
    time: '20 hr(s) ago',
    unread: 1,
    verified: true,
    route: '/creator-assistant',
  },
  {
    id: 'official',
    type: 'official',
    title: 'Official',
    subtitle: 'Who would be the Guarded Host & Guardian',
    time: '1 day(s) ago',
    unread: 0,
    verified: true,
    route: '/official',
  },
  {
    id: 'system',
    type: 'system',
    title: 'System Notifications',
    subtitle: 'Video violates community guidelines',
    time: '6 day(s) ago',
    unread: 0,
    route: '/system-notifications',
  },
];

export type InfoItem = { id: string; title: string; body: string; time: string };

export const INFO_CONTENT: Record<string, { title: string; items: InfoItem[] }> = {
  assistant: {
    title: 'Creator Assistant',
    items: [
      {
        id: 'a1',
        title: 'Your data summary for the past week',
        body: 'Video views: 1.2K (+18%)\nNew likes: 86\nNew followers: 12\nComments: 24\n\nKeep posting regularly to grow faster!',
        time: '20 hr(s) ago',
      },
      {
        id: 'a2',
        title: 'Posting tip',
        body: 'Your followers are most active between 7 PM and 10 PM. Try uploading your next video in this time slot for more views.',
        time: '2 day(s) ago',
      },
      {
        id: 'a3',
        title: 'Welcome to Creator Assistant',
        body: 'Here you will get weekly insights, growth tips and updates about your videos and live rooms.',
        time: '1 week ago',
      },
    ],
  },
  official: {
    title: 'Official',
    items: [
      {
        id: 'o1',
        title: 'Who would be the Guarded Host & Guardian',
        body: 'Top supporters and hosts of the week get special Guardian badges. Go live, stay active and support your favourite hosts to be featured.',
        time: '1 day(s) ago',
      },
      {
        id: 'o2',
        title: 'New: Family Rooms',
        body: 'Create or join a Family room, chat with your group and enjoy live voice rooms together.',
        time: '3 day(s) ago',
      },
      {
        id: 'o3',
        title: 'Welcome!',
        body: 'Thanks for joining us. Stay tuned here for official announcements, events and rewards.',
        time: '2 week(s) ago',
      },
    ],
  },
  system: {
    title: 'System Notifications',
    items: [
      {
        id: 's1',
        title: 'Video violates community guidelines',
        body: 'One of your videos was removed because it may violate our community guidelines. Please read the guidelines before posting again.',
        time: '6 day(s) ago',
      },
      {
        id: 's2',
        title: 'Account security',
        body: 'Your account was logged in from a new device. If this was not you, please change your password.',
        time: '2 week(s) ago',
      },
      {
        id: 's3',
        title: 'App updated',
        body: 'We improved performance and fixed some bugs. Enjoy a smoother experience!',
        time: '3 week(s) ago',
      },
    ],
  },
};

// notification type (Firestore) -> row
export const NOTIF_ROWS: {
  id: string;
  rowType: RowType;
  notifType: string;
  title: string;
  empty: string;
  action: string;
}[] = [
  { id: 'followers', rowType: 'followers', notifType: 'follow', title: 'Followers', empty: 'No new followers', action: 'followed you' },
  { id: 'comments', rowType: 'comments', notifType: 'comment', title: 'Comments', empty: 'No comments yet', action: 'commented on your video' },
  { id: 'likes', rowType: 'likes', notifType: 'like', title: 'Likes', empty: 'No likes yet', action: 'liked your video' },
];

export const toMillis = (ts: any) =>
  ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;

export const timeAgo = (ms: number) => {
  if (!ms) return '';
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min(s) ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr(s) ago`;
  return `${Math.floor(h / 24)} day(s) ago`;
};

export const getLevelTheme = (level = 1) => {
  if (level >= 50) return { bg: '#7B1FFF', border: '#FFD700', text: '#fff', icon: '#FFD700' };
  if (level >= 40) return { bg: '#00BFFF', border: '#9EF8FF', text: '#fff', icon: '#fff' };
  if (level >= 30) return { bg: '#FF0066', border: '#FFB6C1', text: '#fff', icon: '#fff' };
  if (level >= 20) return { bg: '#FFC107', border: '#FFE082', text: '#000', icon: '#fff' };
  if (level >= 10) return { bg: '#BDBDBD', border: '#fff', text: '#fff', icon: '#fff' };
  return { bg: '#222', border: '#555', text: '#FFD700', icon: '#00E5FF' };
};

export const keyById = (item: { id: string }) => item.id;
