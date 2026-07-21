import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Package,
  Presentation
} from "lucide-react";
import type { DriveItem } from "@/lib/db";

function extension(item: Pick<DriveItem, "name">) {
  return item.name.split(".").pop()?.toLowerCase() || "";
}

export function isImageFile(item: Pick<DriveItem, "name" | "mime_type">) {
  return Boolean(item.mime_type?.startsWith("image/")) || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "heic"].includes(extension(item));
}

export function isVideoFile(item: Pick<DriveItem, "name" | "mime_type">) {
  return Boolean(item.mime_type?.startsWith("video/")) || ["mp4", "webm", "mov", "mkv", "avi", "flv", "wmv", "m4v"].includes(extension(item));
}

export function isAudioFile(item: Pick<DriveItem, "name" | "mime_type">) {
  return Boolean(item.mime_type?.startsWith("audio/")) || ["mp3", "wav", "ogg", "m4a", "aac", "flac", "wma"].includes(extension(item));
}

export function FileTypeIcon({ item }: { item: DriveItem }) {
  const ext = extension(item);

  if (item.kind === "folder") return <Folder className="folder-icon" />;
  if (isImageFile(item)) return <FileImage className="image-icon" />;
  if (isVideoFile(item)) return <FileVideo className="video-icon" />;
  if (isAudioFile(item)) return <FileAudio className="audio-icon" />;
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"].includes(ext)) return <FileArchive className="archive-icon" />;
  if (["exe", "msi", "msix", "appx", "appxbundle", "apk", "ipa", "dmg", "pkg", "deb", "rpm", "appimage", "iso"].includes(ext)) return <Package className="software-icon" />;
  if (["xls", "xlsx", "xlsm", "ods", "csv"].includes(ext)) return <FileSpreadsheet className="spreadsheet-icon" />;
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return <Presentation className="presentation-icon" />;
  if (["js", "jsx", "ts", "tsx", "html", "css", "scss", "vue", "py", "java", "c", "cpp", "cs", "go", "rs", "php", "sql", "json", "xml", "yaml", "yml", "sh", "ps1"].includes(ext)) return <FileCode2 className="code-icon" />;
  if (item.mime_type?.includes("pdf") || item.mime_type?.startsWith("text/") || ["doc", "docx", "odt", "rtf", "txt", "md", "log"].includes(ext)) return <FileText className="document-icon" />;
  return <File className="file-icon" />;
}
