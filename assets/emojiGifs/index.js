// Animated emoji GIFs. Reaction value Firestore me "g:<name>" ke form me jata hai.
export const EMOJI_GIFS = {
  laugh:   require('./laugh.gif'),
  cry:     require('./cry.gif'),
  love:    require('./love.gif'),
  angry:   require('./angry.gif'),
  kiss:    require('./kiss.gif'),
  cool:    require('./cool.gif'),
  shy:     require('./shy.gif'),
  wow:     require('./wow.gif'),
  sleep:   require('./sleep.gif'),
  party:   require('./party.gif'),
  sorry:   require('./sorry.gif'),
  welcome: require('./welcome.gif'),
  thanks:  require('./thanks.gif'),
};
export const GIF_KEYS = Object.keys(EMOJI_GIFS).map((k) => 'g:' + k);
export const isGifReaction = (e) => typeof e === 'string' && e.startsWith('g:') && !!EMOJI_GIFS[e.slice(2)];
export const gifSource = (e) => EMOJI_GIFS[String(e).slice(2)];
