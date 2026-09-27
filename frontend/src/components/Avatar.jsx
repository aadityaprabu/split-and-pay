const sizes = {
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-10 text-base",
};

/** Google profile photo, or the first letter of the name when there isn't one */
export default function Avatar({ name, pictureUrl, size = "md" }) {
  const sizeClasses = sizes[size];
  if (pictureUrl) {
    return <img src={pictureUrl} alt="" referrerPolicy="no-referrer" className={`${sizeClasses} shrink-0 rounded-full`} />;
  }
  return (
    <div
      aria-hidden="true"
      className={`${sizeClasses} grid shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary`}
    >
      {(name ?? "?").trim()[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
