export type SftpEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number | null;
  permissions: number | null;
};

export type SftpListing = {
  path: string;
  entries: SftpEntry[];
  truncated: boolean;
};

export type SftpDownload = {
  name: string;
  path: string;
  size: number;
  data: string;
};

export type SftpChunk = {
  data: string;
  offset: number;
  size: number;
  eof: boolean;
};

export const SFTP_CHUNK_BYTES = 512 * 1024;

export const SFTP_MAX_BYTES = 4 * 1024 * 1024;
