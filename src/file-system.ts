import { closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { IoFailure, type ByteChannel, type StreamMode } from './runtime/stream.ts';

const OPEN_FLAGS: Record<StreamMode, string> = { read: 'r', write: 'w', append: 'a', 'read-write': 'r+' };

const REASONS: Record<string, string> = {
  EACCES: 'permission denied',
  EBUSY: 'the file is busy',
  EDQUOT: 'the disk quota is exceeded',
  EEXIST: 'it already exists',
  EFBIG: 'the file is too large',
  EINVAL: 'the operation is not valid for this file',
  EIO: 'an input/output error occurred',
  EISDIR: 'it is a directory',
  ELOOP: 'there are too many levels of symbolic links',
  EMFILE: 'too many files are open',
  ENAMETOOLONG: 'the name is too long',
  ENFILE: 'too many files are open',
  ENOENT: 'no such file or directory',
  ENOSPC: 'no space left on the device',
  ENOTDIR: 'a part of the path is not a directory',
  ENOTEMPTY: 'the directory is not empty',
  ENXIO: 'no such device',
  EPERM: 'the operation is not permitted',
  EPIPE: 'the other end of the pipe was closed',
  EROFS: 'the file system is read-only',
  ETXTBSY: 'the file is busy',
  EXDEV: 'the new path is on a different file system',
};

const ERRNO_CODE = /^E[A-Z0-9]+$/;

function errorCode(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

export function systemFailure(action: string, description: string, error: unknown): IoFailure {
  if (error instanceof IoFailure) return error;
  const code = errorCode(error);
  if (code === 'ERR_INVALID_ARG_VALUE' || code === 'ERR_INVALID_ARG_TYPE') return new IoFailure(`cannot ${action} ${description}: the path is not valid`);
  if (code === null || !ERRNO_CODE.test(code)) throw error;
  return new IoFailure(`cannot ${action} ${description}: ${REASONS[code] ?? `the operating system reported ${code}`}`);
}

function descriptorChannel(descriptor: number, positioned: boolean, description: string): ByteChannel {
  return {
    positioned,
    read: (buffer, start, length, position) => {
      try {
        return readSync(descriptor, buffer, start, length, position);
      } catch (error) {
        throw systemFailure('read', description, error);
      }
    },
    write: (bytes, start, length, position) => {
      let written = 0;
      while (written < length) {
        try {
          written += writeSync(descriptor, bytes, start + written, length - written, position === null ? null : position + written);
        } catch (error) {
          throw systemFailure('write', description, error);
        }
      }
    },
    close: () => {
      try {
        closeSync(descriptor);
      } catch (error) {
        throw systemFailure('close', description, error);
      }
    },
  };
}

export function openFile(path: string, mode: StreamMode, description: string): ByteChannel {
  let descriptor: number;
  try {
    descriptor = openSync(path, OPEN_FLAGS[mode]);
  } catch (error) {
    throw systemFailure('open', description, error);
  }
  let isDirectory: boolean;
  try {
    isDirectory = fstatSync(descriptor).isDirectory();
  } catch (error) {
    closeSync(descriptor);
    throw systemFailure('open', description, error);
  }
  if (isDirectory) {
    closeSync(descriptor);
    throw new IoFailure(`cannot open ${description}: it is a directory`);
  }
  return descriptorChannel(descriptor, mode === 'read-write', description);
}

export function absolutePath(path: string): string {
  return resolve(path);
}

export type PathKind = 'file' | 'directory' | 'other';

export function pathKind(path: string): PathKind | null {
  try {
    const stats = statSync(path);
    if (stats.isDirectory()) return 'directory';
    return stats.isFile() ? 'file' : 'other';
  } catch {
    return null;
  }
}

export function removeFile(path: string, description: string): void {
  try {
    if (lstatSync(path).isDirectory()) throw new IoFailure(`cannot remove ${description}: it is a directory`);
    unlinkSync(path);
  } catch (error) {
    throw systemFailure('remove', description, error);
  }
}

export function renamePath(from: string, to: string, fromDescription: string, toDescription: string): void {
  let fromIsDirectory: boolean;
  try {
    fromIsDirectory = lstatSync(from).isDirectory();
  } catch (error) {
    throw systemFailure('rename', fromDescription, error);
  }
  const target = pathKind(to);
  if (target === 'directory' && !fromIsDirectory) throw new IoFailure(`cannot rename ${fromDescription} to ${toDescription}: ${toDescription} is a directory`);
  if (target !== null && target !== 'directory' && fromIsDirectory) throw new IoFailure(`cannot rename ${fromDescription} to ${toDescription}: ${toDescription} is not a directory`);
  try {
    renameSync(from, to);
  } catch (error) {
    throw systemFailure('rename', `${fromDescription} to ${toDescription}`, error);
  }
}

export function listDirectory(path: string, description: string): string[] {
  try {
    if (!statSync(path).isDirectory()) throw new IoFailure(`cannot list ${description}: it is not a directory`);
    return readdirSync(path);
  } catch (error) {
    throw systemFailure('list', description, error);
  }
}
