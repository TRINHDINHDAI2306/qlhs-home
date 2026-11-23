import { avatarStyle, initial } from '../lib/avatar';

export function Avatar({ name }: { name: string }) {
  return <span className="avatar" style={avatarStyle(name)} aria-hidden>{initial(name)}</span>;
}
