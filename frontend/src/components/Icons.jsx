// Small stroke icons (24px grid), sized and coloured by the caller through className
function Icon({ className = "size-5", children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const ReceiptIcon = (props) => (
  <Icon {...props}>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

export const HandshakeIcon = (props) => (
  <Icon {...props}>
    <path d="M12 7 9 4H4v8l8 8 8-8V4h-5z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const ShieldIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
  </Icon>
);

export const ListIcon = (props) => (
  <Icon {...props}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
);

export const PlusIcon = (props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ChevronDownIcon = (props) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const LogOutIcon = (props) => (
  <Icon {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Icon>
);

export const TrashIcon = (props) => (
  <Icon {...props}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </Icon>
);

export const CheckIcon = (props) => (
  <Icon {...props}>
    <path d="m5 12 5 5L20 7" />
  </Icon>
);

export const PencilIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);

export const PaperclipIcon = (props) => (
  <Icon {...props}>
    <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7" />
  </Icon>
);

export const ChatIcon = (props) => (
  <Icon {...props}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </Icon>
);

export const UsersIcon = (props) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  </Icon>
);

export const FileIcon = (props) => (
  <Icon {...props}>
    <path d="M14 3H6v18h12V7z" />
    <path d="M14 3v4h4M9 13h6M9 17h6" />
  </Icon>
);

export const CameraIcon = (props) => (
  <Icon {...props}>
    <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

export const XIcon = (props) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const DownloadIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);

export const ArrowLeftIcon = (props) => (
  <Icon {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
