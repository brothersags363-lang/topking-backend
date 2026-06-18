export let videos = [
  {
    id: '1',
    video:
      'https://www.w3schools.com/html/mov_bbb.mp4',
    username: '@ags_aman',
    caption: '#viral #short',
    likes: '120K',
    comments: '5K',
    shares: '1K',
    profile:
      'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  },
];

export const addVideo = (newVideo) => {
  videos.unshift(newVideo);
};