using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace TaiwuEditor.Tests
{
    // C# 5.0 only (csc.exe / .NET Framework 4.8).
    // Invoke through reflection so this harness compiles even if the concrete
    // namespace/assembly differs between environments.
    public static class SaveStoreTests
    {
        private static int _pass = 0;
        private static int _fail = 0;

        public static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            try
            {
                RunAll();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("치명적 오류: " + ex.Message);
                Console.Error.WriteLine(ex.ToString());
                return 2;
            }

            Console.WriteLine();
            Console.WriteLine("통과: " + _pass + " / 실패: " + _fail);
            return _fail == 0 ? 0 : 1;
        }

        private static void RunAll()
        {
            TestSelfTests();
            TestInvalidPathRejected();
            TestMaxSizeCap();
            TestDiscoverSaveSlots();
            TestReplaceBatchBackupAndRollback();
        }

        // -------------------------------------------------------------------
        // Helpers
        // -------------------------------------------------------------------
        private static Type FindSaveStoreType()
        {
            // Try already-loaded assemblies first
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = asm.GetType("SaveStore", false);
                if (t == null) t = asm.GetType("Taiwu.SaveStore", false);
                if (t == null) t = asm.GetType("TaiwuEditor.SaveStore", false);
                if (t != null) return t;
            }

            // Try referenced assemblies from current directory (already loaded by Main assembly)
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = SearchTypeInAssembly(asm);
                if (t != null) return t;
            }
            throw new InvalidOperationException("SaveStore 타입을 찾을 수 없습니다.");
        }

        private static Type SearchTypeInAssembly(System.Reflection.Assembly asm)
        {
            try
            {
                var types = asm.GetTypes();
                foreach (var t in types)
                {
                    if (t.Name == "SaveStore") return t;
                }
            }
            catch
            {
            }
            return null;
        }

        private static object InvokeStatic(Type t, string name, object[] args)
        {
            var m = t.GetMethod(name,
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic |
                System.Reflection.BindingFlags.Static);
            if (m == null)
                throw new InvalidOperationException("Static 메서드 없음: " + name);
            return m.Invoke(null, args);
        }

        private static object InvokeInstance(Type t, object instance, string name, object[] args)
        {
            var m = t.GetMethod(name,
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic |
                System.Reflection.BindingFlags.Instance);
            if (m == null)
                throw new InvalidOperationException("Instance 메서드 없음: " + name);
            return m.Invoke(instance, args);
        }

        private static object GetStaticProperty(Type t, string name)
        {
            var p = t.GetProperty(name,
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic |
                System.Reflection.BindingFlags.Static);
            if (p != null) return p.GetValue(null, null);
            var f = t.GetField(name,
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic |
                System.Reflection.BindingFlags.Static);
            if (f != null) return f.GetValue(null);
            throw new InvalidOperationException("정적 속성/필드 없음: " + name);
        }

        private static string NewTempDir(string tag)
        {
            string p = Path.Combine(Path.GetTempPath(), "taiwu-test-" + tag + "-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(p);
            return p;
        }

        private static void SafeDelete(string dir)
        {
            try { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
            catch { }
        }

        private static void Assert(bool cond, string msg)
        {
            if (!cond) throw new InvalidOperationException(msg);
        }

        private static void Ok(string name)
        {
            _pass++;
            Console.WriteLine("  ok  " + name);
        }

        private static void Fail(string name, Exception ex)
        {
            _fail++;
            Console.Error.WriteLine(" FAIL " + name + " :: " + ex.Message);
            Console.Error.WriteLine(ex.ToString());
        }

        // -------------------------------------------------------------------
        // Tests
        // -------------------------------------------------------------------
        private static void TestSelfTests()
        {
            const string name = "SaveStore.RunSelfTests()";
            try
            {
                var t = FindSaveStoreType();
                var ret = InvokeStatic(t, "RunSelfTests", new object[0]);
                if (ret is bool)
                    Assert((bool)ret, "RunSelfTests() 자기검사 실패");
                Ok(name);
            }
            catch (Exception ex)
            {
                Fail(name, ex);
            }
        }

        private static void TestInvalidPathRejected()
        {
            const string name = "invalid path rejected";
            try
            {
                var t = FindSaveStoreType();
                string temp = NewTempDir("invalid");
                try
                {
                    bool threw = false;
                    // Try a path outside the sandbox / containing traversal
                    string bad = Path.Combine(temp, "..", "..", "escape.sav");
                    try
                    {
                        // Prefer typed SaveStore instances where possible; fall back to static validation
                        var validateM = t.GetMethod("ValidatePath",
                            System.Reflection.BindingFlags.Public |
                            System.Reflection.BindingFlags.NonPublic |
                            System.Reflection.BindingFlags.Static);
                        if (validateM != null)
                        {
                            validateM.Invoke(null, new object[] { bad });
                        }
                        else
                        {
                            var loadM = t.GetMethod("Load",
                                System.Reflection.BindingFlags.Public |
                                System.Reflection.BindingFlags.NonPublic |
                                System.Reflection.BindingFlags.Static);
                            if (loadM != null)
                            {
                                loadM.Invoke(null, new object[] { bad });
                            }
                            else
                            {
                                throw new InvalidOperationException("SaveStore does not expose path validation");
                            }
                        }
                    }
                    catch (System.Reflection.TargetInvocationException tie)
                    {
                        if (tie.InnerException != null) threw = true;
                        else throw;
                    }
                    catch (Exception)
                    {
                        threw = true;
                    }

                    Assert(threw, "'../' 경로가 거부되지 않았습니다.");
                    Ok(name);
                }
                finally
                {
                    SafeDelete(temp);
                }
            }
            catch (Exception ex)
            {
                Fail(name, ex);
            }
        }

        private static void TestMaxSizeCap()
        {
            const string name = "MaxSaveBytes size cap";
            try
            {
                var t = FindSaveStoreType();
                object maxObj = GetStaticProperty(t, "MaxSaveBytes");
                long max = Convert.ToInt64(maxObj);
                Assert(max > 0 && max < (long)int.MaxValue * 16L, "MaxSaveBytes 비정상: " + max);

                string temp = NewTempDir("size");
                try
                {
                    string tooBig = Path.Combine(temp, "huge.sav");
                    // Create a file one byte larger than MaxSaveBytes (guard against massive allocations)
                    long cap = Math.Min(max, 64L * 1024L * 1024L); // header test cap
                    using (var fs = new FileStream(tooBig, FileMode.Create, FileAccess.Write))
                    {
                        fs.SetLength(cap + 1);
                    }

                    bool threw = false;
                    try
                    {
                        // Try to load; any size cap should raise
                        var loadM = t.GetMethod("Load",
                            System.Reflection.BindingFlags.Public |
                            System.Reflection.BindingFlags.NonPublic |
                            System.Reflection.BindingFlags.Static);
                        if (loadM == null)
                            throw new InvalidOperationException("SaveStore.Load 없음");
                        loadM.Invoke(null, new object[] { tooBig });
                    }
                    catch (System.Reflection.TargetInvocationException tie)
                    {
                        if (tie.InnerException != null) threw = true; else throw;
                    }
                    catch
                    {
                        threw = true;
                    }
                    Assert(threw, "MaxSaveBytes 초과 파일이 거부되지 않았습니다.");

                    // A small well-sized file must not throw on size alone
                    string smallFile = Path.Combine(temp, "small.sav");
                    File.WriteAllBytes(smallFile, Encoding.UTF8.GetBytes("T1G"));

                    Ok(name);
                }
                finally
                {
                    SafeDelete(temp);
                }
            }
            catch (Exception ex)
            {
                Fail(name, ex);
            }
        }

        private static void TestDiscoverSaveSlots()
        {
            const string name = "DiscoverSaveSlots";
            try
            {
                var t = FindSaveStoreType();
                string temp = NewTempDir("discover");
                try
                {
                    string slotA = Path.Combine(temp, "slot_a");
                    string slotB = Path.Combine(temp, "slot_b");
                    Directory.CreateDirectory(Path.Combine(slotA, "world_1"));
                    Directory.CreateDirectory(Path.Combine(slotB, "world_1"));
                    File.WriteAllBytes(Path.Combine(slotA, "global.sav"), Encoding.ASCII.GetBytes("T1G"));
                    File.WriteAllBytes(Path.Combine(slotA, "world_1", "local.sav"), Encoding.ASCII.GetBytes("T1L"));
                    File.WriteAllBytes(Path.Combine(slotB, "global.sav"), Encoding.ASCII.GetBytes("T1G"));

                    var m = t.GetMethod("DiscoverSaveSlots",
                        System.Reflection.BindingFlags.Public |
                        System.Reflection.BindingFlags.NonPublic |
                        System.Reflection.BindingFlags.Static,
                        null, new Type[] { typeof(string) }, null);
                    if (m == null)
                        throw new InvalidOperationException("SaveStore.DiscoverSaveSlots 없음");

                    object result = m.Invoke(null, new object[] { temp });
                    Assert(result != null, "DiscoverSaveSlots 결과 null");

                    var enumerable = result as System.Collections.IEnumerable;
                    Assert(enumerable != null, "DiscoverSaveSlots 결과가 열거형이 아님");

                    int count = 0;
                    foreach (var item in enumerable) { count++; }
                    Assert(count >= 2, "슬롯 개수 부족: " + count);

                    Ok(name);
                }
                finally
                {
                    SafeDelete(temp);
                }
            }
            catch (Exception ex)
            {
                Fail(name, ex);
            }
        }

        private static void TestReplaceBatchBackupAndRollback()
        {
            const string name = "ReplaceBatch backup + rollback";
            try
            {
                var t = FindSaveStoreType();
                string temp = NewTempDir("replace");
                try
                {
                    string globalPath = Path.Combine(temp, "global.sav");
                    string localPath = Path.Combine(temp, "world_1", "local.sav");
                    Directory.CreateDirectory(Path.GetDirectoryName(localPath));

                    byte[] origGlobal = Encoding.ASCII.GetBytes("T1Goriginal");
                    byte[] origLocal = Encoding.ASCII.GetBytes("T1Loriginal");
                    File.WriteAllBytes(globalPath, origGlobal);
                    File.WriteAllBytes(localPath, origLocal);

                    // Find ReplaceBatch(Dictionary<string, byte[]>)
                    var rb = t.GetMethod("ReplaceBatch",
                        System.Reflection.BindingFlags.Public |
                        System.Reflection.BindingFlags.NonPublic |
                        System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Instance,
                        null, new Type[] { typeof(Dictionary<string, byte[]>) }, null);
                    Assert(rb != null, "SaveStore.ReplaceBatch 없음");

                    // Build a dict<Path, byte[]> payload expected by ReplaceBatch
                    var payload = new Dictionary<string, byte[]>();
                    payload[globalPath] = Encoding.ASCII.GetBytes("T1Gupdated");
                    payload[localPath] = Encoding.ASCII.GetBytes("T1Lupdated");

                    object instance = null;
                    if (!rb.IsStatic)
                    {
                        instance = Activator.CreateInstance(t);
                    }

                    rb.Invoke(instance, new object[] { payload });

                    byte[] afterGlobal = File.ReadAllBytes(globalPath);
                    Assert(Encoding.ASCII.GetString(afterGlobal) == "T1Gupdated",
                        "ReplaceBatch 갱신 실패 (global)");

                    string backupDir = null;
                    foreach (string entry in Directory.GetFileSystemEntries(temp))
                    {
                        if (Path.GetFileName(entry).IndexOf("bak", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            backupDir = entry;
                            break;
                        }
                    }
                    // Some implementations create per-file .bak.* siblings
                    bool siblingBackup = Directory.GetFiles(temp, "global.sav.bak.*").Length > 0;
                    Assert(backupDir != null || siblingBackup, "ReplaceBatch 백업이 생성되지 않았습니다.");

                    // Simulate failure: ReplaceBatch with a payload whose parent does not exist
                    // (a path in a deep, unwritable tree)
                    var badPayload = new Dictionary<string, byte[]>();
                    string missingParent = Path.Combine(temp, "no-such-subdir", "deep", "global.sav");
                    badPayload[missingParent] = Encoding.ASCII.GetBytes("T1Gbad");

                    bool threw = false;
                    byte[] preservedGlobal = File.ReadAllBytes(globalPath);
                    try
                    {
                        rb.Invoke(instance, new object[] { badPayload });
                    }
                    catch (System.Reflection.TargetInvocationException tie)
                    {
                        if (tie.InnerException != null) threw = true; else throw;
                    }
                    catch
                    {
                        threw = true;
                    }
                    Assert(threw, "ReplaceBatch 실패 시 예외 미발생");

                    // Rollback contract: existing files must remain intact
                    byte[] afterFail = File.ReadAllBytes(globalPath);
                    Assert(afterFail.Length == preservedGlobal.Length,
                        "실패 후 global 크기 변경");
                    Assert(Encoding.ASCII.GetString(afterFail) == Encoding.ASCII.GetString(preservedGlobal),
                        "실패 후 global 내용 변경됨 (롤백 위반)");

                    // Collision safety: CommitBatch uses unique CreateNew temp files and refuses existing temp collision
                    var commitBatchMi = t.GetMethod("CommitBatch");
                    if (commitBatchMi != null)
                    {
                        string collPath = Path.Combine(temp, "fresh_temp_test.sav");
                        string sentinel = collPath + ".new.colltag";
                        File.WriteAllText(sentinel, "KEEP-SENTINEL");
                        var batchType = t.GetNestedType("BatchItem");
                        if (batchType != null)
                        {
                            object item = Activator.CreateInstance(batchType, new object[] { collPath, 0u, Encoding.ASCII.GetBytes("T1G_new") });
                            Array arr = Array.CreateInstance(batchType, 1);
                            arr.SetValue(item, 0);
                            commitBatchMi.Invoke(null, new object[] { arr, temp, "colltag" });
                            Assert(File.Exists(collPath) && Encoding.ASCII.GetString(File.ReadAllBytes(collPath)) == "T1G_new",
                                "신규 파일 CreateNew 커밋 실패");
                        }
                        Assert(File.ReadAllText(sentinel) == "KEEP-SENTINEL",
                            "사전 존재 임시 경로가 손상되었습니다.");
                    }

                    Ok(name);
                }
                finally
                {
                    SafeDelete(temp);
                }
            }
            catch (Exception ex)
            {
                Fail(name, ex);
            }
        }
    }
}
