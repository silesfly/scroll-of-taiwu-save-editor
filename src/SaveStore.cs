using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace TaiwuEditor
{
    public static class SaveStore
    {
        public const int MaxSaveBytes = 32 * 1024 * 1024;
        public const string GlobalSavName = "global.sav";
        public const string LocalSavName = "local.sav";
        private const uint T1G_MAGIC = 0x47315431u;
        private const uint T1L_MAGIC = 0x4C315431u;
        private const int SaveVersion = 4;

        public sealed class BatchItem
        {
            public string Path;
            public uint ExpectedHash;
            public byte[] Data;
            public BatchItem(string path, uint expectedHash, byte[] data)
            {
                this.Path = path;
                this.ExpectedHash = expectedHash;
                this.Data = data;
            }
        }

        public sealed class CommitResult
        {
            private bool _success;
            private string _error;
            private List<string> _backups;
            public CommitResult(bool success, string error, List<string> backups)
            {
                this._success = success;
                this._error = error;
                this._backups = backups;
            }
            public bool Success { get { return this._success; } }
            public string Error { get { return this._error; } }
            public List<string> BackupPaths { get { return this._backups; } }
        }

        public sealed class SaveSlot
        {
            private string _slotRoot;
            private string _globalSav;
            private List<string> _worldSav;
            public SaveSlot(string slotRoot, string globalSav, List<string> worldSav)
            {
                this._slotRoot = slotRoot;
                this._globalSav = globalSav;
                this._worldSav = worldSav;
            }
            public string SlotRoot { get { return this._slotRoot; } }
            public string GlobalSavPath { get { return this._globalSav; } }
            public List<string> WorldSavPaths { get { return this._worldSav; } }
        }

        // ===== Win32 =====
        private const uint GENERIC_READ = 0x80000000u;
        private const uint GENERIC_WRITE = 0x40000000u;
        private const uint DELETE_ACCESS = 0x00010000u;
        private const uint FILE_SHARE_NONE = 0u;
        private const uint FILE_SHARE_READ = 0x00000001u;
        private const uint FILE_SHARE_WRITE = 0x00000002u;
        private const uint FILE_SHARE_DELETE = 0x00000004u;
        private const uint OPEN_EXISTING = 3u;
        private const uint CREATE_NEW = 1u;
        private const uint FILE_ATTRIBUTE_NORMAL = 0x00000080u;
        private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000u;
        private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000u;
        private const uint FILE_ATTRIBUTE_DIRECTORY = 0x00000010u;
        private const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400u;
        private const uint VOLUME_NAME_DOS = 0x0u;
        private const int FileRenameInfoClass = 3;
        private const int FileDispositionInfoClass = 4;

        [StructLayout(LayoutKind.Sequential)]
        private struct BY_HANDLE_FILE_INFORMATION
        {
            public uint FileAttributes;
            public uint CreationTimeLow;
            public uint CreationTimeHigh;
            public uint LastAccessTimeLow;
            public uint LastAccessTimeHigh;
            public uint LastWriteTimeLow;
            public uint LastWriteTimeHigh;
            public uint VolumeSerialNumber;
            public uint FileSizeHigh;
            public uint FileSizeLow;
            public uint NumberOfLinks;
            public uint FileIndexHigh;
            public uint FileIndexLow;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess,
            uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition,
            uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetFileInformationByHandle(IntPtr hFile,
            out BY_HANDLE_FILE_INFORMATION lpFileInformation);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandleW(IntPtr hFile, StringBuilder lpszFilePath,
            uint cchFilePath, uint dwFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetFileInformationByHandle(IntPtr hFile, int FileInformationClass,
            IntPtr lpFileInformation, uint dwBufferSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FlushFileBuffers(IntPtr hFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool MoveFileExW(string lpExistingFileName, string lpNewFileName, uint dwFlags);

        // ===== CRC32 =====
        private static uint[] _crcTable;
        private static uint[] CrcTable
        {
            get
            {
                if (_crcTable == null)
                {
                    uint[] t = new uint[256];
                    for (uint i = 0; i < 256; i++)
                    {
                        uint c = i;
                        for (int k = 0; k < 8; k++)
                        {
                            c = ((c & 1) != 0) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
                        }
                        t[i] = c;
                    }
                    _crcTable = t;
                }
                return _crcTable;
            }
        }

        public static uint Crc32(byte[] data)
        {
            if (data == null) return 0;
            return Crc32(data, 0, data.Length);
        }

        public static uint Crc32(byte[] data, int offset, int count)
        {
            if (data == null || offset < 0 || count < 0 || offset + count > data.Length) return 0;
            uint[] tbl = CrcTable;
            uint crc = 0xFFFFFFFFu;
            for (int i = 0; i < count; i++)
            {
                crc = (crc >> 8) ^ tbl[(crc ^ data[offset + i]) & 0xFF];
            }
            return crc ^ 0xFFFFFFFFu;
        }

        public static bool QuickValidate(byte[] data, bool isGlobal)
        {
            if (data == null || data.Length < 8) return false;
            uint magic = (uint)(data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24));
            uint expect = isGlobal ? T1G_MAGIC : T1L_MAGIC;
            if (magic != expect) return false;
            int ver = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
            return ver == SaveVersion;
        }

        // ===== Path canonicalization =====
        private static string GetCanonicalPath(string path)
        {
            return Path.GetFullPath(path).TrimEnd('\\', '/');
        }

        private static bool IsPathInsideRoot(string canonicalPath, string canonicalRoot)
        {
            if (string.IsNullOrEmpty(canonicalPath) || string.IsNullOrEmpty(canonicalRoot)) return false;
            string p = canonicalPath.TrimEnd('\\', '/');
            string r = canonicalRoot.TrimEnd('\\', '/');
            if (p.Length <= r.Length) return false;
            if (!p.StartsWith(r, StringComparison.OrdinalIgnoreCase)) return false;
            char sep = p[r.Length];
            return sep == '\\' || sep == '/';
        }

        // ===== Safe file read =====
        public static byte[] SafeReadAllBytes(string path, out string error)
        {
            error = null;
            IntPtr h = IntPtr.Zero;
            try
            {
                string full = GetCanonicalPath(path);
                h = CreateFileW(full, GENERIC_READ, FILE_SHARE_READ,
                    IntPtr.Zero, OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS,
                    IntPtr.Zero);
                if (h == new IntPtr(-1))
                {
                    error = "파일을 열 수 없습니다: " + full;
                    h = IntPtr.Zero;
                    return null;
                }
                BY_HANDLE_FILE_INFORMATION info;
                if (!GetFileInformationByHandle(h, out info))
                {
                    error = "파일 정보 조회 실패.";
                    return null;
                }
                if ((info.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0)
                {
                    error = "디렉터리는 열람할 수 없습니다.";
                    return null;
                }
                if ((info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
                {
                    error = "재해석 지점(심볼릭 링크)은 허용되지 않습니다.";
                    return null;
                }
                if (info.NumberOfLinks != 1)
                {
                    error = "하드링크된 파일은 허용되지 않습니다.";
                    return null;
                }
                long size = ((long)info.FileSizeHigh << 32) | (long)info.FileSizeLow;
                if (size > MaxSaveBytes)
                {
                    error = "파일 크기가 허용 한도를 초과합니다.";
                    return null;
                }
                byte[] buf = new byte[(int)size];
                if (size > 0)
                {
                    IntPtr owned = h;
                    h = IntPtr.Zero;
                    using (SafeFileHandle sfh = new SafeFileHandle(owned, true))
                    using (FileStream fs = new FileStream(sfh, FileAccess.Read))
                    {
                        int read = 0;
                        while (read < buf.Length)
                        {
                            int n = fs.Read(buf, read, buf.Length - read);
                            if (n <= 0) break;
                            read += n;
                        }
                        if (read != buf.Length)
                        {
                            error = "파일 읽기 실패.";
                            return null;
                        }
                    }
                }
                if (h != IntPtr.Zero && h != new IntPtr(-1))
                {
                    CloseHandle(h);
                    h = IntPtr.Zero;
                }
                return buf;
            }
            catch (Exception ex)
            {
                error = "파일 읽기 예외: " + ex.Message;
                return null;
            }
            finally
            {
                if (h != IntPtr.Zero && h != new IntPtr(-1)) CloseHandle(h);
            }
        }

        // ===== Verified file identity check =====
        private static bool VerifySingleLinkRegularFile(IntPtr h, out BY_HANDLE_FILE_INFORMATION info)
        {
            if (!GetFileInformationByHandle(h, out info)) return false;
            if ((info.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) return false;
            if ((info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) return false;
            if (info.NumberOfLinks != 1) return false;
            return true;
        }

        private static string GetFinalPath(IntPtr h)
        {
            StringBuilder sb = new StringBuilder(1024);
            uint n = GetFinalPathNameByHandleW(h, sb, (uint)sb.Capacity, VOLUME_NAME_DOS);
            if (n == 0) return null;
            if (n >= sb.Capacity)
            {
                sb = new StringBuilder((int)n + 1);
                n = GetFinalPathNameByHandleW(h, sb, (uint)sb.Capacity, VOLUME_NAME_DOS);
                if (n == 0) return null;
            }
            string s = sb.ToString();
            if (s.StartsWith(@"\\?\UNC\", StringComparison.Ordinal)) s = @"\\" + s.Substring(8);
            else if (s.StartsWith(@"\\?\", StringComparison.Ordinal)) s = s.Substring(4);
            return s;
        }

        private static bool HasReparseAncestor(string canonicalPath, string stopRoot)
        {
            if (string.IsNullOrEmpty(canonicalPath) || string.IsNullOrEmpty(stopRoot)) return false;
            string dir;
            try { dir = Path.GetDirectoryName(canonicalPath); }
            catch { return true; }
            string stop = stopRoot.TrimEnd('\\', '/');
            while (!string.IsNullOrEmpty(dir))
            {
                string cur = dir.TrimEnd('\\', '/');
                if (Directory.Exists(cur))
                {
                    try
                    {
                        if ((File.GetAttributes(cur) & FileAttributes.ReparsePoint) != 0) return true;
                    }
                    catch { return true; }
                }
                if (string.Equals(cur, stop, StringComparison.OrdinalIgnoreCase)) break;
                DirectoryInfo parent = null;
                try { parent = Directory.GetParent(cur); } catch { break; }
                if (parent == null) break;
                dir = parent.FullName;
            }
            return false;
        }

        private static bool VerifyFinalPathInsideRoot(string candidatePath, string canonicalRoot, bool allowEqual)
        {
            if (string.IsNullOrEmpty(candidatePath) || string.IsNullOrEmpty(canonicalRoot)) return false;
            IntPtr h = CreateFileW(candidatePath, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                IntPtr.Zero, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_BACKUP_SEMANTICS, IntPtr.Zero);
            if (h == new IntPtr(-1) || h == IntPtr.Zero) return false;
            try
            {
                string finalPath = GetFinalPath(h);
                if (string.IsNullOrEmpty(finalPath) || finalPath.StartsWith(@"\\", StringComparison.Ordinal)) return false;
                string fp = finalPath.TrimEnd('\\', '/');
                if (allowEqual && string.Equals(fp, canonicalRoot.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase)) return true;
                return IsPathInsideRoot(fp, canonicalRoot);
            }
            finally
            {
                CloseHandle(h);
            }
        }

        private static bool RenameByHandle(IntPtr h, string destPath, bool replaceIfExists)
        {
            if (h == IntPtr.Zero || h == new IntPtr(-1) || string.IsNullOrEmpty(destPath)) return false;
            byte[] nameBytes = Encoding.Unicode.GetBytes(destPath);
            int headerSize = IntPtr.Size * 2 + 4;
            int totalSize = headerSize + nameBytes.Length + 2;
            IntPtr buf = Marshal.AllocHGlobal(totalSize);
            try
            {
                byte[] zeros = new byte[totalSize];
                Marshal.Copy(zeros, 0, buf, totalSize);
                Marshal.WriteByte(buf, 0, replaceIfExists ? (byte)1 : (byte)0);
                Marshal.WriteIntPtr(buf, IntPtr.Size, IntPtr.Zero);
                Marshal.WriteInt32(buf, IntPtr.Size * 2, nameBytes.Length);
                Marshal.Copy(nameBytes, 0, new IntPtr(buf.ToInt64() + headerSize), nameBytes.Length);
                return SetFileInformationByHandle(h, FileRenameInfoClass, buf, (uint)totalSize);
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        private static bool DeleteByHandle(IntPtr h)
        {
            if (h == IntPtr.Zero || h == new IntPtr(-1)) return false;
            IntPtr buf = Marshal.AllocHGlobal(1);
            try
            {
                Marshal.WriteByte(buf, 0, 1);
                return SetFileInformationByHandle(h, FileDispositionInfoClass, buf, 1u);
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        private static bool PinAncestorDirectories(string canonDir, string canonicalRoot,
            HashSet<string> pinnedDirs, List<IntPtr> pinnedHandles, out string error)
        {
            error = null;
            string stop = canonicalRoot.TrimEnd('\\', '/');
            string cur = canonDir.TrimEnd('\\', '/');
            while (!string.IsNullOrEmpty(cur))
            {
                if (pinnedDirs.Add(cur))
                {
                    // Omit FILE_SHARE_DELETE so no ancestor up to canonicalRoot can be renamed or swapped with a junction.
                    IntPtr dirH = CreateFileW(cur, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                        IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
                    if (dirH == new IntPtr(-1) || dirH == IntPtr.Zero)
                    {
                        error = "상위 디렉터리 핸들 열기 실패: " + cur;
                        return false;
                    }
                    pinnedHandles.Add(dirH);
                    BY_HANDLE_FILE_INFORMATION dinfo;
                    if (!GetFileInformationByHandle(dirH, out dinfo) ||
                        (dinfo.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
                        (dinfo.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0)
                    {
                        error = "상위 디렉터리가 재해석 지점이거나 유효하지 않습니다: " + cur;
                        return false;
                    }
                    string finalDir = GetFinalPath(dirH);
                    string fpDir = string.IsNullOrEmpty(finalDir) ? "" : finalDir.TrimEnd('\\', '/');
                    if (string.IsNullOrEmpty(fpDir) || fpDir.StartsWith(@"\\", StringComparison.Ordinal) ||
                        (!string.Equals(fpDir, stop, StringComparison.OrdinalIgnoreCase) && !IsPathInsideRoot(fpDir, stop)))
                    {
                        error = "상위 디렉터리 최종 경로가 루트를 벗어납니다: " + cur;
                        return false;
                    }
                }
                if (string.Equals(cur, stop, StringComparison.OrdinalIgnoreCase)) break;
                DirectoryInfo parent = null;
                try { parent = Directory.GetParent(cur); } catch { break; }
                if (parent == null) break;
                cur = parent.FullName.TrimEnd('\\', '/');
            }
            return true;
        }

        // ===== Atomic batch commit =====
        public static CommitResult CommitBatch(BatchItem[] items, string rootDir, string timestampTag)
        {
            List<string> backups = new List<string>();
            if (items == null || items.Length == 0)
            {
                return new CommitResult(false, "배치 항목이 없습니다.", backups);
            }
            if (string.IsNullOrEmpty(rootDir))
            {
                return new CommitResult(false, "루트 디렉터리가 비어 있습니다.", backups);
            }
            string canonicalRoot;
            try { canonicalRoot = GetCanonicalPath(rootDir); }
            catch (Exception ex) { return new CommitResult(false, "루트 경로 오류: " + ex.Message, backups); }

            if (string.IsNullOrEmpty(timestampTag)) timestampTag = DateTime.UtcNow.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
            string canonicalTag = timestampTag.Replace("\\", "_").Replace("/", "_").Replace(":", "_");

            List<IntPtr> touchedTempHandles = new List<IntPtr>();
            List<IntPtr> backedUpHandles = new List<IntPtr>();
            List<string> backedUpOrigPaths = new List<string>();
            List<IntPtr> renamedTempHandles = new List<IntPtr>();
            List<IntPtr> pinnedHandles = new List<IntPtr>();
            HashSet<string> pinnedDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            List<IntPtr> itemLockHandles = new List<IntPtr>();
            List<string> finalPaths = new List<string>();
            List<IntPtr> tempHandles = new List<IntPtr>();
            try
            {
                // Phase 1: pin ancestor dirs (no FILE_SHARE_DELETE) + lock existing targets (FILE_SHARE_NONE)
                foreach (BatchItem it in items)
                {
                    if (it == null || string.IsNullOrEmpty(it.Path) || it.Data == null)
                        return new CommitResult(false, "잘못된 배치 항목입니다.", backups);
                    if (it.Data.Length > MaxSaveBytes)
                        return new CommitResult(false, "데이터가 허용 크기를 초과합니다.", backups);
                    string canon = GetCanonicalPath(it.Path);
                    if (!IsPathInsideRoot(canon, canonicalRoot))
                        return new CommitResult(false, "경로 이탈이 감지되었습니다: " + it.Path, backups);
                    if (HasReparseAncestor(canon, canonicalRoot))
                        return new CommitResult(false, "상위 디렉터리에 재해석 지점이 허용되지 않습니다: " + it.Path, backups);
                    string canonDir = Path.GetDirectoryName(canon);
                    if (string.IsNullOrEmpty(canonDir) || !Directory.Exists(canonDir))
                        return new CommitResult(false, "상위 디렉터리 경로가 루트를 벗어납니다: " + it.Path, backups);
                    string pinErr;
                    if (!PinAncestorDirectories(canonDir, canonicalRoot, pinnedDirs, pinnedHandles, out pinErr))
                        return new CommitResult(false, pinErr, backups);

                    IntPtr lockH = IntPtr.Zero;
                    if (File.Exists(canon))
                    {
                        lockH = CreateFileW(canon, GENERIC_READ | DELETE_ACCESS, FILE_SHARE_NONE,
                            IntPtr.Zero, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
                        if (lockH == new IntPtr(-1) || lockH == IntPtr.Zero)
                            return new CommitResult(false, "기존 파일 배타 잠금 실패: " + canon, backups);
                        pinnedHandles.Add(lockH);
                        BY_HANDLE_FILE_INFORMATION finfo;
                        if (!VerifySingleLinkRegularFile(lockH, out finfo))
                            return new CommitResult(false, "기존 파일이 재해석 지점이거나 다중 링크입니다: " + canon, backups);
                        string finalFile = GetFinalPath(lockH);
                        if (string.IsNullOrEmpty(finalFile) || finalFile.StartsWith(@"\\", StringComparison.Ordinal) ||
                            !IsPathInsideRoot(finalFile.TrimEnd('\\', '/'), canonicalRoot))
                            return new CommitResult(false, "최종 파일 경로가 루트를 벗어납니다: " + canon, backups);
                        long sz = ((long)finfo.FileSizeHigh << 32) | (long)finfo.FileSizeLow;
                        if (sz > MaxSaveBytes)
                            return new CommitResult(false, "기존 파일 크기가 허용 한도를 초과합니다: " + canon, backups);
                        byte[] cur = new byte[(int)sz];
                        if (sz > 0)
                        {
                            using (SafeFileHandle sfh = new SafeFileHandle(lockH, false))
                            using (FileStream rfs = new FileStream(sfh, FileAccess.Read))
                            {
                                int read = 0;
                                while (read < cur.Length)
                                {
                                    int n = rfs.Read(cur, read, cur.Length - read);
                                    if (n <= 0) break;
                                    read += n;
                                }
                                if (read != cur.Length)
                                    return new CommitResult(false, "기존 파일 읽기 실패: " + canon, backups);
                            }
                        }
                        if (Crc32(cur) != it.ExpectedHash)
                            return new CommitResult(false, "해시 불일치(동시 변경 감지): " + canon, backups);
                    }
                    else
                    {
                        if (it.ExpectedHash != 0)
                            return new CommitResult(false, "신규 파일에 대한 예상 해시 불일치: " + canon, backups);
                    }
                    itemLockHandles.Add(lockH);
                    finalPaths.Add(canon);
                }

                // Phase 2: create temp files exclusively via handle (FILE_SHARE_NONE + DELETE_ACCESS), keep open until Phase 3 rename
                foreach (BatchItem it in items)
                {
                    string canon = GetCanonicalPath(it.Path);
                    string tempPath = canon + ".new." + canonicalTag + "." + Guid.NewGuid().ToString("N").Substring(0, 8);
                    IntPtr tempH = CreateFileW(tempPath, GENERIC_READ | GENERIC_WRITE | DELETE_ACCESS, FILE_SHARE_NONE,
                        IntPtr.Zero, CREATE_NEW, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
                    if (tempH == new IntPtr(-1) || tempH == IntPtr.Zero)
                        throw new IOException("임시 파일 배타 생성 실패: " + tempPath);
                    pinnedHandles.Add(tempH);
                    touchedTempHandles.Add(tempH);
                    string tempFinal = GetFinalPath(tempH);
                    if (string.IsNullOrEmpty(tempFinal) || tempFinal.StartsWith(@"\\", StringComparison.Ordinal) ||
                        !IsPathInsideRoot(tempFinal.TrimEnd('\\', '/'), canonicalRoot))
                        throw new IOException("임시 파일 최종 경로가 루트를 벗어납니다: " + tempPath);
                    using (SafeFileHandle tsfh = new SafeFileHandle(tempH, false))
                    using (FileStream fs = new FileStream(tsfh, FileAccess.Write))
                    {
                        fs.Write(it.Data, 0, it.Data.Length);
                        fs.Flush();
                    }
                    FlushFileBuffers(tempH);
                    tempHandles.Add(tempH);
                }

                // Phase 3: rename strictly by handle via SetFileInformationByHandle(FileRenameInfo) while all locks remain held
                for (int i = 0; i < finalPaths.Count; i++)
                {
                    string finalPath = finalPaths[i];
                    IntPtr lockH = itemLockHandles[i];
                    IntPtr tempH = tempHandles[i];
                    if (lockH != IntPtr.Zero)
                    {
                        string backupPath = finalPath + ".bak." + canonicalTag + "." + Guid.NewGuid().ToString("N").Substring(0, 6);
                        if (!RenameByHandle(lockH, backupPath, false))
                            throw new IOException("백업 핸들 이동 실패: " + finalPath);
                        backedUpHandles.Add(lockH);
                        backedUpOrigPaths.Add(finalPath);
                        backups.Add(backupPath);
                    }
                    if (!RenameByHandle(tempH, finalPath, false))
                        throw new IOException("최종 핸들 이동 실패: " + finalPath);
                    touchedTempHandles.Remove(tempH);
                    renamedTempHandles.Add(tempH);
                }

                return new CommitResult(true, null, backups);
            }
            catch (Exception ex)
            {
                // Rollback strictly by open handles before releasing locks
                try
                {
                    for (int i = renamedTempHandles.Count - 1; i >= 0; i--)
                    {
                        try { DeleteByHandle(renamedTempHandles[i]); } catch { }
                    }
                    for (int i = backedUpHandles.Count - 1; i >= 0; i--)
                    {
                        try { RenameByHandle(backedUpHandles[i], backedUpOrigPaths[i], false); } catch { }
                    }
                    for (int i = touchedTempHandles.Count - 1; i >= 0; i--)
                    {
                        try { DeleteByHandle(touchedTempHandles[i]); } catch { }
                    }
                }
                catch { }
                return new CommitResult(false, "커밋 실패: " + ex.Message, backups);
            }
            finally
            {
                for (int i = 0; i < pinnedHandles.Count; i++)
                {
                    IntPtr ph = pinnedHandles[i];
                    if (ph != IntPtr.Zero && ph != new IntPtr(-1))
                    {
                        try { CloseHandle(ph); } catch { }
                    }
                }
            }
        }

        // ===== Discovery =====
        public static List<SaveSlot> DiscoverSaveSlots()
        {
            List<SaveSlot> result = new List<SaveSlot>();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            List<string> candidates = new List<string>();
            try
            {
                string[] steamRoots = new string[]
                {
                    @"C:\Program Files (x86)\Steam",
                    @"C:\Program Files\Steam",
                    @"D:\Steam",
                    @"D:\SteamLibrary",
                    @"E:\Steam",
                    @"E:\SteamLibrary"
                };
                foreach (string sr in steamRoots)
                {
                    try
                    {
                        string apps = Path.Combine(sr, "steamapps", "common");
                        if (Directory.Exists(apps))
                        {
                            string taiwu = Path.Combine(apps, "The Scroll Of Taiwu");
                            if (Directory.Exists(taiwu))
                            {
                                candidates.Add(taiwu);
                                foreach (string d in Directory.GetDirectories(taiwu, "SaveGames*"))
                                    candidates.Add(d);
                            }
                        }
                    }
                    catch { }
                }
                string localLow = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                if (!string.IsNullOrEmpty(localLow))
                {
                    string conch = Path.Combine(localLow + "Low", "ConchShip");
                    if (Directory.Exists(conch))
                    {
                        candidates.Add(conch);
                        foreach (string d in Directory.GetDirectories(conch, "SaveGames*"))
                            candidates.Add(d);
                        foreach (string d in Directory.GetDirectories(conch))
                        {
                            string name = Path.GetFileName(d);
                            if (name.StartsWith("The Scroll Of Taiwu", StringComparison.OrdinalIgnoreCase))
                                candidates.Add(d);
                        }
                    }
                }
            }
            catch { }

            foreach (string root in candidates)
            {
                try
                {
                    if (!Directory.Exists(root)) continue;
                    string globalPath = Path.Combine(root, GlobalSavName);
                    if (!File.Exists(globalPath)) continue;
                    string canonRoot = GetCanonicalPath(root);
                    if (seen.Contains(canonRoot)) continue;
                    List<string> worlds = new List<string>();
                    foreach (string d in Directory.GetDirectories(root, "world_*"))
                    {
                        string lp = Path.Combine(d, LocalSavName);
                        if (File.Exists(lp)) worlds.Add(GetCanonicalPath(lp));
                    }
                    seen.Add(canonRoot);
                    result.Add(new SaveSlot(canonRoot, GetCanonicalPath(globalPath), worlds));
                }
                catch { }
            }
            return result;
        }

        // ===== Self tests =====
        public static string RunSelfTests()
        {
            StringBuilder log = new StringBuilder();
            int passed = 0, failed = 0;
            string tempDir = Path.Combine(Path.GetTempPath(), "Taiwu_SaveStoreTest_" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(tempDir);
                // Test 1: CRC32 known value
                byte[] check = Encoding.ASCII.GetBytes("123456789");
                uint c = Crc32(check);
                if (c == 0xCBF43926u) { passed++; log.AppendLine("[OK] CRC32 표준값"); }
                else { failed++; log.AppendLine("[FAIL] CRC32 표준값: " + c.ToString("X8")); }

                // Test 2: path traversal
                bool insideOk = IsPathInsideRoot(GetCanonicalPath(Path.Combine(tempDir, "a.sav")), GetCanonicalPath(tempDir));
                bool outsideRejected = !IsPathInsideRoot(GetCanonicalPath(Path.Combine(tempDir, "..", "evil.sav")), GetCanonicalPath(tempDir));
                if (insideOk && outsideRejected) { passed++; log.AppendLine("[OK] 경로 이탈 거부"); }
                else { failed++; log.AppendLine("[FAIL] 경로 이탈 거부"); }

                // Test 3: quick validate magic
                byte[] t1g = new byte[8];
                t1g[0] = (byte)(T1G_MAGIC & 0xFF);
                t1g[1] = (byte)((T1G_MAGIC >> 8) & 0xFF);
                t1g[2] = (byte)((T1G_MAGIC >> 16) & 0xFF);
                t1g[3] = (byte)((T1G_MAGIC >> 24) & 0xFF);
                t1g[4] = (byte)(SaveVersion & 0xFF);
                if (QuickValidate(t1g, true) && !QuickValidate(t1g, false)) { passed++; log.AppendLine("[OK] T1G 매직 검증"); }
                else { failed++; log.AppendLine("[FAIL] T1G 매직 검증"); }

                // Test 4: handle security - single link & regular file
                string secFile = Path.Combine(tempDir, "sec.sav");
                File.WriteAllBytes(secFile, new byte[] { 1, 2, 3, 4 });
                IntPtr h = CreateFileW(GetCanonicalPath(secFile), GENERIC_READ, FILE_SHARE_READ,
                    IntPtr.Zero, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
                bool ok = false;
                if (h != new IntPtr(-1) && h != IntPtr.Zero)
                {
                    BY_HANDLE_FILE_INFORMATION info;
                    ok = VerifySingleLinkRegularFile(h, out info);
                    CloseHandle(h);
                }
                if (ok) { passed++; log.AppendLine("[OK] 핸들 보안 검사(단일 링크)"); }
                else { failed++; log.AppendLine("[FAIL] 핸들 보안 검사"); }

                // Test 5: atomic multi-file batch
                string rootA = Path.Combine(tempDir, "saveA");
                Directory.CreateDirectory(rootA);
                string gPath = Path.Combine(rootA, GlobalSavName);
                string wDir = Path.Combine(rootA, "world_1");
                Directory.CreateDirectory(wDir);
                string lPath = Path.Combine(wDir, LocalSavName);
                byte[] origG = MakeHeader(T1G_MAGIC, 10);
                byte[] origL = MakeHeader(T1L_MAGIC, 20);
                File.WriteAllBytes(gPath, origG);
                File.WriteAllBytes(lPath, origL);
                uint hg = Crc32(origG);
                uint hl = Crc32(origL);
                byte[] newG = MakeHeader(T1G_MAGIC, 30);
                byte[] newL = MakeHeader(T1L_MAGIC, 40);
                BatchItem[] batch = new BatchItem[]
                {
                    new BatchItem(gPath, hg, newG),
                    new BatchItem(lPath, hl, newL)
                };
                CommitResult cr = CommitBatch(batch, rootA, "test1");
                bool commitOk = cr.Success
                    && Crc32(File.ReadAllBytes(gPath)) == Crc32(newG)
                    && Crc32(File.ReadAllBytes(lPath)) == Crc32(newL)
                    && File.Exists(gPath + ".bak.test1")
                    && File.Exists(lPath + ".bak.test1");
                if (commitOk) { passed++; log.AppendLine("[OK] 원자적 배치 커밋"); }
                else { failed++; log.AppendLine("[FAIL] 원자적 배치 커밋: " + (cr.Error ?? "")); }

                // Test 6: rollback on stale hash
                byte[] curG = File.ReadAllBytes(gPath);
                BatchItem[] stale = new BatchItem[]
                {
                    new BatchItem(gPath, hg, newG),
                    new BatchItem(lPath, Crc32(curG), newL)
                };
                CommitResult cr2 = CommitBatch(stale, rootA, "test2");
                bool staleRejected = !cr2.Success;
                if (staleRejected) { passed++; log.AppendLine("[OK] 해시 불일치 거부"); }
                else { failed++; log.AppendLine("[FAIL] 해시 불일치 거부"); }

                // Test 7: backup file remains singular
                string secFile2 = Path.Combine(tempDir, "single.sav");
                File.WriteAllBytes(secFile2, new byte[] { 9, 9, 9 });
                string errOut;
                byte[] rd = SafeReadAllBytes(secFile2, out errOut);
                if (rd != null && rd.Length == 3) { passed++; log.AppendLine("[OK] 안전 읽기"); }
                else { failed++; log.AppendLine("[FAIL] 안전 읽기: " + (errOut ?? "")); }
            }
            catch (Exception ex)
            {
                failed++;
                log.AppendLine("[FAIL] 예외: " + ex.Message);
            }
            finally
            {
                try { if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true); }
                catch { }
            }
            log.AppendLine(string.Format(CultureInfo.InvariantCulture, "결과: 통과 {0}, 실패 {1}", passed, failed));
            return log.ToString();
        }

        public static byte[] Load(string path)
        {
            string err;
            byte[] data = SafeReadAllBytes(path, out err);
            if (data == null || !string.IsNullOrEmpty(err))
            {
                throw new InvalidOperationException(string.IsNullOrEmpty(err) ? ("읽기 실패: " + path) : err);
            }
            return data;
        }

        public static Dictionary<string, object> LoadSlot(string slotDirOrLocalPath)
        {
            if (string.IsNullOrEmpty(slotDirOrLocalPath))
            {
                throw new ArgumentException("저장 경로가 비어 있습니다.", "slotDirOrLocalPath");
            }
            string slotDir = Directory.Exists(slotDirOrLocalPath)
                ? slotDirOrLocalPath
                : Path.GetDirectoryName(Path.GetFullPath(slotDirOrLocalPath));
            string localPath = Directory.Exists(slotDirOrLocalPath)
                ? Path.Combine(slotDir, "local.sav")
                : slotDirOrLocalPath;
            byte[] localBytes = Load(localPath);
            string globalPath = Path.Combine(slotDir, "global.sav");
            if (!File.Exists(globalPath))
            {
                string parentGlobal = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(slotDir)) ?? slotDir, "global.sav");
                if (File.Exists(parentGlobal)) globalPath = parentGlobal;
            }
            string gErr;
            byte[] globalBytes = File.Exists(globalPath) ? SafeReadAllBytes(globalPath, out gErr) : null;
            Dictionary<string, object> res = new Dictionary<string, object>();
            res["ok"] = true;
            res["localSavB64"] = Convert.ToBase64String(localBytes);
            res["globalSavB64"] = globalBytes == null ? null : Convert.ToBase64String(globalBytes);
            res["slotDir"] = slotDir;
            return res;
        }

        public static CommitResult ReplaceBatch(string slotDirOrLocalPath, byte[] localBytes)
        {
            if (string.IsNullOrEmpty(slotDirOrLocalPath) || localBytes == null)
            {
                throw new ArgumentException("저장 인자가 올바르지 않습니다.");
            }
            string rootDir = Directory.Exists(slotDirOrLocalPath)
                ? slotDirOrLocalPath
                : Path.GetDirectoryName(Path.GetFullPath(slotDirOrLocalPath));
            string localPath = Directory.Exists(slotDirOrLocalPath)
                ? Path.Combine(rootDir, "local.sav")
                : slotDirOrLocalPath;
            string expected = "";
            if (File.Exists(localPath))
            {
                expected = Sha256Hex(File.ReadAllBytes(localPath));
            }
            BatchItem[] items = new BatchItem[] { new BatchItem(localPath, 0u, localBytes) };
            items[0].ExpectedHash = expected.Length > 0 ? Crc32(File.ReadAllBytes(localPath)) : 0u;
            string tag = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fff", CultureInfo.InvariantCulture);
            return CommitBatch(items, rootDir, tag);
        }

        public static CommitResult ReplaceBatch(BatchItem[] items, string rootDir, string timestampTag)
        {
            return CommitBatch(items, rootDir, timestampTag);
        }

        public static List<SaveSlot> DiscoverSaveSlots(string customRoot)
        {
            List<SaveSlot> slots = new List<SaveSlot>();
            if (string.IsNullOrEmpty(customRoot)) return slots;
            string root;
            try { root = Path.GetFullPath(customRoot); }
            catch { return slots; }
            if (!Directory.Exists(root)) return slots;

            List<string> dirs = new List<string>();
            dirs.Add(root);
            try { dirs.AddRange(Directory.GetDirectories(root, "*", SearchOption.AllDirectories)); }
            catch { }

            for (int i = 0; i < dirs.Count; i++)
            {
                string dir = dirs[i];
                string globalPath = Path.Combine(dir, GlobalSavName);
                bool hasGlobal = File.Exists(globalPath);
                List<string> worlds = new List<string>();
                try
                {
                    string[] worldDirs = Directory.GetDirectories(dir, "world_*", SearchOption.TopDirectoryOnly);
                    for (int j = 0; j < worldDirs.Length; j++)
                    {
                        string lp = Path.Combine(worldDirs[j], LocalSavName);
                        if (File.Exists(lp)) worlds.Add(lp);
                    }
                }
                catch { }
                if (hasGlobal || worlds.Count > 0)
                {
                    slots.Add(new SaveSlot(dir, hasGlobal ? globalPath : "", worlds));
                }
            }
            return slots;
        }

        public static CommitResult ReplaceBatch(Dictionary<string, byte[]> updates)
        {
            if (updates == null || updates.Count == 0)
            {
                throw new ArgumentException("저장 대상이 비어 있습니다.", "updates");
            }
            List<string> keys = new List<string>(updates.Keys);
            string firstPath = Path.GetFullPath(keys[0]);
            string rootDir = Path.GetDirectoryName(firstPath);
            for (int i = 1; i < keys.Count; i++)
            {
                string full = Path.GetFullPath(keys[i]);
                while (rootDir != null && !full.StartsWith(rootDir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                {
                    DirectoryInfo parent = Directory.GetParent(rootDir);
                    rootDir = parent == null ? null : parent.FullName;
                }
            }
            if (string.IsNullOrEmpty(rootDir))
            {
                throw new ArgumentException("공통 저장 루트 경로를 찾을 수 없습니다.", "updates");
            }
            BatchItem[] items = new BatchItem[keys.Count];
            for (int i = 0; i < keys.Count; i++)
            {
                string fullPath = Path.GetFullPath(keys[i]);
                string parent = Path.GetDirectoryName(fullPath);
                if (string.IsNullOrEmpty(parent) || !Directory.Exists(parent))
                {
                    throw new DirectoryNotFoundException("대상 디렉터리가 없습니다: " + parent);
                }
                uint expectedHash = File.Exists(fullPath) ? Crc32(File.ReadAllBytes(fullPath)) : 0u;
                items[i] = new BatchItem(fullPath, expectedHash, updates[keys[i]]);
            }
            string tag = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fff", CultureInfo.InvariantCulture);
            CommitResult res = CommitBatch(items, rootDir, tag);
            if (!res.Success)
            {
                throw new InvalidOperationException(res.Error);
            }
            return res;
        }

        public static bool ExportSlot(string slotDir, byte[] data)
        {
            if (string.IsNullOrEmpty(slotDir) || data == null || data.Length > MaxSaveBytes) return false;
            try
            {
                string fullDir = Path.GetFullPath(slotDir);
                string exportDir = Path.Combine(fullDir, "exports");
                Directory.CreateDirectory(exportDir);
                string dst = Path.Combine(exportDir, "export_" + DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fff", CultureInfo.InvariantCulture) + ".sav");
                File.WriteAllBytes(dst, data);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string Sha256Hex(byte[] data)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] h = sha.ComputeHash(data);
                StringBuilder sb = new StringBuilder(h.Length * 2);
                for (int i = 0; i < h.Length; i++) sb.Append(h[i].ToString("x2", CultureInfo.InvariantCulture));
                return sb.ToString();
            }
        }

        private static byte[] MakeHeader(uint magic, int payloadLen)
        {
            byte[] b = new byte[8 + payloadLen];
            b[0] = (byte)(magic & 0xFF);
            b[1] = (byte)((magic >> 8) & 0xFF);
            b[2] = (byte)((magic >> 16) & 0xFF);
            b[3] = (byte)((magic >> 24) & 0xFF);
            b[4] = (byte)(SaveVersion & 0xFF);
            for (int i = 8; i < b.Length; i++) b[i] = (byte)(i & 0x7F);
            return b;
        }
    }
}
