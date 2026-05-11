import { useState } from "react";
import { SessionMeta } from "../types";

interface Props {
  session: SessionMeta;
  isActive: boolean;
  timeAgo: string;
  onClick: () => void;
}

function shortenPath(path: string): string {
  const homePatterns = ["/Users/", "/home/"];
  for (const prefix of homePatterns) {
    if (path.startsWith(prefix)) {
      const after = path.slice(prefix.length);
      const slash = after.indexOf("/");
      return slash >= 0 ? "~" + after.slice(slash) : "~";
    }
  }
  return path;
}

export default function SessionCard({ session, isActive, timeAgo, onClick }: Props) {
  const [hovered, setHovered] = useState(false);

  const background = isActive
    ? styles.active.background
    : hovered
    ? "var(--bg-hover)"
    : "transparent";

  return (
    <button
      onClick={onClick}
      style={{
        ...styles.card,
        ...(isActive ? styles.active : {}),
        background,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.top}>
        <span style={styles.project}>{shortenPath(session.cwd)}</span>
        <span style={styles.time}>{timeAgo}</span>
      </div>
      <div style={styles.message}>{session.first_message}</div>
      <div style={styles.meta}>
        <span style={styles.badge}>{session.message_count} msgs</span>
      </div>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    borderRadius: "var(--radius-md)",
    textAlign: "left",
    transition: "var(--transition)",
    marginBottom: 2,
    border: "1px solid transparent",
  },
  active: {
    background: "var(--accent-muted)",
    border: "1px solid rgba(212, 132, 90, 0.25)",
  },
  top: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  project: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "65%",
  },
  time: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    flexShrink: 0,
  },
  message: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  meta: {
    display: "flex",
    gap: 6,
    marginTop: 6,
  },
  badge: {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    background: "var(--bg-tertiary)",
    color: "var(--text-tertiary)",
    fontWeight: 500,
  },
};
