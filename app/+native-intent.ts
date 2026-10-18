// WhatsApp / browser se aaya link app khulte hi yahan se sahi screen par jata hai.
// https://HOST/profile/ID   -> /userProfile?userId=ID
// https://HOST/video/ID     -> /openVideo?id=ID
// https://HOST/live/ID?key= -> /openLive?id=ID&key=
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const m = String(path).match(/\/(profile|video|live)\/([^/?#]+)(?:\?([^#]*))?/);
    if (!m) return path;

    const kind = m[1];
    const id = m[2];
    const query = m[3] || "";
    const keyMatch = query.match(/(?:^|&)key=([^&]+)/);
    const key = keyMatch ? keyMatch[1] : "";

    if (kind === "profile") return `/userProfile?userId=${id}`;
    if (kind === "video") return `/openVideo?id=${id}`;
    return `/openLive?id=${id}${key ? `&key=${key}` : ""}`;
  } catch (e) {
    return "/";
  }
}
