// One consistent line-icon set, drawn on a 24px grid.

function Svg({ size = 18, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const MinusIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)

export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const CheckIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const ChevronLeftIcon = (p) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)

export const ChevronRightIcon = (p) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)

export const ChevronDownIcon = (p) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)

export const EyeIcon = (p) => (
  <Svg {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const EyeOffIcon = (p) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1c.5-.1.9-.1 1.4-.1 6.4 0 10 7 10 7a17 17 0 0 1-3.1 4" />
    <path d="M6.6 6.7C3.7 8.6 2 12 2 12s3.6 7 10 7c1.6 0 3.1-.4 4.4-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
)

export const TrashIcon = (p) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6.5 7l1 12.5h9l1-12.5" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
)

export const PencilIcon = (p) => (
  <Svg {...p}>
    <path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8.5 19 4 20z" />
    <path d="M14.5 6l3.5 3.5" />
  </Svg>
)

export const DownloadIcon = (p) => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <path d="M7.5 10.5L12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </Svg>
)

export const UploadIcon = (p) => (
  <Svg {...p}>
    <path d="M12 15V4" />
    <path d="M7.5 8.5L12 4l4.5 4.5" />
    <path d="M5 19.5h14" />
  </Svg>
)

export const BoxIcon = (p) => (
  <Svg {...p}>
    <rect x="5" y="6" width="14" height="12" rx="1" />
    <circle cx="5" cy="6" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="5" cy="18" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="18" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
)

export const WandIcon = (p) => (
  <Svg {...p}>
    <path d="M4.5 19.5L15 9" />
    <path d="M13.5 7.5l3 3" />
    <path d="M19 3v3.4M17.3 4.7h3.4" />
    <path d="M8 4v2.4M6.8 5.2h2.4" />
    <path d="M19.5 13v2.4M18.3 14.2h2.4" />
  </Svg>
)

export const SnapIcon = (p) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
    <path d="M3 3l3.2 3.2M21 3l-3.2 3.2M3 21l3.2-3.2M21 21l-3.2-3.2" />
  </Svg>
)

export const SimilarIcon = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="10" height="10" rx="1.5" />
    <rect x="10.5" y="10.5" width="10" height="10" rx="1.5" strokeDasharray="2.6 2.6" />
  </Svg>
)

export const SparkIcon = (p) => (
  <Svg {...p}>
    <path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9L11 3.5z" />
    <path d="M18.5 16v4M16.5 18h4" />
  </Svg>
)

export const CopyIcon = (p) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5.5 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v.5" />
  </Svg>
)

export const UndoIcon = (p) => (
  <Svg {...p}>
    <path d="M8 5L3.5 9.5 8 14" />
    <path d="M4 9.5h10a5.5 5.5 0 0 1 0 11h-3" />
  </Svg>
)

export const RedoIcon = (p) => (
  <Svg {...p}>
    <path d="M16 5l4.5 4.5L16 14" />
    <path d="M20 9.5H10a5.5 5.5 0 0 0 0 11h3" />
  </Svg>
)

export const KeyboardIcon = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
  </Svg>
)

export const FitIcon = (p) => (
  <Svg {...p}>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
  </Svg>
)

export const MoreIcon = (p) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
)

export const ImageIcon = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5" />
  </Svg>
)
