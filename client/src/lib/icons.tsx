/**
 * Central icon exports — all icons use @hugeicons/react + @hugeicons/core-free-icons.
 * Import all icons from here throughout the app.
 */
import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  ArrowLeft01Icon,
  ArrowUp01Icon,
  PlayIcon,
  SparklesIcon,
  Attachment01Icon,
  Menu01Icon,
  Cancel01Icon,
  MessageMultiple01Icon,
  Analytics01Icon,
  Setting07Icon,
  Home01Icon,
  SearchList01Icon,
  EyeIcon,
  ViewOffIcon,
  Mail01Icon,
  UserIcon,
  LockPasswordIcon,
  File01Icon,
  FolderLibraryIcon,
  DocumentAttachmentIcon,
  PlusSignIcon,
  Tick01Icon,
  SidebarLeft01Icon,
  DocumentValidationIcon,
  BarChartIcon,
  ZapIcon,
  LockIcon,
  GridIcon,
  ArrowRight02Icon,
  UploadIcon,
  Book02Icon,
  LogoutSquare01Icon,
  ChevronDown as ChevronDownIcon,
  Folder01Icon,
  Alert02Icon,
  InformationCircleIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Delete02Icon,
  Edit02Icon,
  Image01Icon,
  HelpCircleIcon,
  Archive02Icon,
  MoreHorizontalIcon,
  Mic01Icon,
  Pdf01Icon,
  Xls01Icon,
  Doc01Icon,
} from '@hugeicons/core-free-icons';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function icon(def: any, size: number, className?: string) {
  return <HugeiconsIcon icon={def} size={size} strokeWidth={1.5} className={className} />;
}

export const IconArrowRight = ({ size = 18, className = '' }) =>
  icon(ArrowRight01Icon, size, className);
export const IconArrowRight2 = ({ size = 18, className = '' }) =>
  icon(ArrowRight02Icon, size, className);
export const IconArrowLeft = ({ size = 18, className = '' }) =>
  icon(ArrowLeft01Icon, size, className);
export const IconArrowUp = ({ size = 18, className = '' }) => icon(ArrowUp01Icon, size, className);
export const IconPlay = ({ size = 18, className = '' }) => icon(PlayIcon, size, className);
export const IconSparkles = ({ size = 18, className = '' }) => icon(SparklesIcon, size, className);
export const IconAttach = ({ size = 18, className = '' }) =>
  icon(Attachment01Icon, size, className);
export const IconMenu = ({ size = 18, className = '' }) => icon(Menu01Icon, size, className);
export const IconClose = ({ size = 18, className = '' }) => icon(Cancel01Icon, size, className);
export const IconChat = ({ size = 18, className = '' }) =>
  icon(MessageMultiple01Icon, size, className);
export const IconAnalytics = ({ size = 18, className = '' }) =>
  icon(Analytics01Icon, size, className);
export const IconSettings = ({ size = 18, className = '' }) => icon(Setting07Icon, size, className);
export const IconHome = ({ size = 18, className = '' }) => icon(Home01Icon, size, className);
export const IconSearch = ({ size = 18, className = '' }) =>
  icon(SearchList01Icon, size, className);
export const IconEye = ({ size = 18, className = '' }) => icon(EyeIcon, size, className);
export const IconEyeOff = ({ size = 18, className = '' }) => icon(ViewOffIcon, size, className);
export const IconMail = ({ size = 18, className = '' }) => icon(Mail01Icon, size, className);
export const IconUser = ({ size = 18, className = '' }) => icon(UserIcon, size, className);
export const IconLockPassword = ({ size = 18, className = '' }) =>
  icon(LockPasswordIcon, size, className);
export const IconFile = ({ size = 18, className = '' }) => icon(File01Icon, size, className);
export const IconFolder = ({ size = 18, className = '' }) =>
  icon(FolderLibraryIcon, size, className);
export const IconUpload = ({ size = 18, className = '' }) => icon(UploadIcon, size, className);
export const IconPlus = ({ size = 18, className = '' }) => icon(PlusSignIcon, size, className);
export const IconCheck = ({ size = 18, className = '' }) => icon(Tick01Icon, size, className);
export const IconSidebar = ({ size = 18, className = '' }) =>
  icon(SidebarLeft01Icon, size, className);
export const IconDocument = ({ size = 18, className = '' }) =>
  icon(DocumentValidationIcon, size, className);
export const IconBarChart = ({ size = 18, className = '' }) => icon(BarChartIcon, size, className);
export const IconZap = ({ size = 18, className = '' }) => icon(ZapIcon, size, className);
export const IconLock = ({ size = 18, className = '' }) => icon(LockIcon, size, className);
export const IconGrid = ({ size = 18, className = '' }) => icon(GridIcon, size, className);
export const IconDocFile = ({ size = 18, className = '' }) =>
  icon(DocumentAttachmentIcon, size, className);
export const IconLibrary = ({ size = 18, className = '' }) => icon(Book02Icon, size, className);
export const IconLogout = ({ size = 18, className = '' }) =>
  icon(LogoutSquare01Icon, size, className);
export const IconChevronDown = ({ size = 18, className = '' }) =>
  icon(ChevronDownIcon, size, className);
export const IconFolderSimple = ({ size = 18, className = '' }) =>
  icon(Folder01Icon, size, className);

export const IconAlert = ({ size = 18, className = '' }) => icon(Alert02Icon, size, className);
export const IconInfo = ({ size = 18, className = '' }) =>
  icon(InformationCircleIcon, size, className);
export const IconSuccess = ({ size = 18, className = '' }) =>
  icon(CheckmarkCircle02Icon, size, className);
export const IconWarning = ({ size = 18, className = '' }) =>
  icon(AlertCircleIcon, size, className);
export const IconDelete = ({ size = 18, className = '' }) => icon(Delete02Icon, size, className);
export const IconEdit = ({ size = 18, className = '' }) => icon(Edit02Icon, size, className);
export const IconMore = ({ size = 18, className = '' }) =>
  icon(MoreHorizontalIcon, size, className);
export const IconArchive = ({ size = 18, className = '' }) =>
  icon(Archive02Icon, size, className);
export const IconImage = ({ size = 18, className = '' }) => icon(Image01Icon, size, className);
export const IconHelp = ({ size = 18, className = '' }) => icon(HelpCircleIcon, size, className);
export const IconMic = ({ size = 18, className = '' }) => icon(Mic01Icon, size, className);
export const IconPdf = ({ size = 18, className = '' }) => icon(Pdf01Icon, size, className);
export const IconXls = ({ size = 18, className = '' }) => icon(Xls01Icon, size, className);
export const IconDoc = ({ size = 18, className = '' }) => icon(Doc01Icon, size, className);
