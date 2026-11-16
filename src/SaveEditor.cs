using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using TaiwuEditor;

namespace ScrollOfTaiwuSaveEditor
{
    public static class SaveEditor
    {
        private const string EditorDir = "dist";
        private const string EditorFile = "dist/ScrollOfTaiwuSaveEditor-v1.0.html";
        private const string ResourceName = "ScrollOfTaiwuSaveEditor.html";

        [STAThread]
        public static int Main(string[] args)
        {
            if (args != null && args.Length > 0 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
            {
                return RunSelfTest();
            }
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new EditorForm());
                return 0;
            }
            catch (Exception ex)
            {
                try
                {
                    MessageBox.Show("시작 중 오류가 발생했습니다: " + ex.Message, "태오회권 세이브 에디터",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                catch { }
                return 1;
            }
        }

        private static int RunSelfTest()
        {
            try
            {
                object r = Invoke("RunSelfTests", new object[] { });
                if (r is int) return (int)r == 0 ? 0 : 1;
                if (r is bool) return (bool)r ? 0 : 1;
                return 0;
            }
            catch (Exception ex)
            {
                try { Console.Error.WriteLine("자가 점검 실패: " + ex.Message); } catch { }
                return 1;
            }
        }

        private static object Invoke(string name, object[] args)
        {
            MethodInfo[] ms = typeof(SaveStore).GetMethods(BindingFlags.Public | BindingFlags.Static);
            for (int i = 0; i < ms.Length; i++)
            {
                if (ms[i].Name != name) continue;
                ParameterInfo[] ps = ms[i].GetParameters();
                if (ps.Length != args.Length) continue;
                return ms[i].Invoke(null, args);
            }
            throw new MissingMethodException("SaveStore." + name);
        }

        internal sealed class EditorForm : Form
        {
            private WebView2 web;
            private bool ready;

            public EditorForm()
            {
                Text = "태오회권 세이브 에디터";
                Width = 1100;
                Height = 760;
                StartPosition = FormStartPosition.CenterScreen;
                MinimumSize = new Size(820, 560);
                try { Icon = null; } catch { }
                Initialize();
            }

            private void Initialize()
            {
                web = new WebView2();
                web.Dock = DockStyle.Fill;
                Controls.Add(web);
                Load += delegate { InitializeAsync(); };
            }

            private async void InitializeAsync()
            {
                try
                {
                    string userData = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "ScrollOfTaiwuSaveEditor", "WebView2");
                    try { Directory.CreateDirectory(userData); } catch { }
                    CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userData, null);
                    await web.EnsureCoreWebView2Async(env);
                    web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                    web.CoreWebView2.Settings.AreDevToolsEnabled = false;
                    web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                    web.CoreWebView2.WebMessageReceived += OnWebMessage;
                    ready = true;
                    LoadHtml();
                }
                catch (Exception ex)
                {
                    try
                    {
                        MessageBox.Show("웹 화면 초기화 실패: " + ex.Message, "태오회권 세이브 에디터",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                    catch { }
                }
            }

            private void LoadHtml()
            {
                string path = ResolveEditorPath();
                if (path != null)
                {
                    try
                    {
                        web.CoreWebView2.Navigate(new Uri(path).AbsoluteUri);
                        return;
                    }
                    catch { }
                }
                web.CoreWebView2.NavigateToString(ReadEmbedded());
            }

            private static string ResolveEditorPath()
            {
                try
                {
                    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    string p1 = Path.Combine(baseDir, EditorFile);
                    if (File.Exists(p1)) return p1;
                    string p2 = Path.Combine(baseDir, EditorDir, "ScrollOfTaiwuSaveEditor-v1.0.html");
                    if (File.Exists(p2)) return p2;
                }
                catch { }
                return null;
            }

            private static string ReadEmbedded()
            {
                Assembly asm = typeof(SaveEditor).Assembly;
                Stream s = asm.GetManifestResourceStream(ResourceName);
                if (s == null)
                {
                    string[] names = asm.GetManifestResourceNames();
                    for (int i = 0; i < names.Length; i++)
                    {
                        if (names[i].EndsWith("ScrollOfTaiwuSaveEditor.html", StringComparison.OrdinalIgnoreCase))
                        {
                            s = asm.GetManifestResourceStream(names[i]);
                            break;
                        }
                    }
                }
                if (s == null)
                {
                    return "<!doctype html><meta charset='utf-8'><h2>태오회권 세이브 에디터</h2><p>화면 리소스를 찾을 수 없습니다.</p>";
                }
                try
                {
                    using (StreamReader r = new StreamReader(s, Encoding.UTF8))
                    {
                        return r.ReadToEnd();
                    }
                }
                finally { s.Dispose(); }
            }

            private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
            {
                string body = null;
                try { body = e.TryGetWebMessageAsString(); } catch { }
                if (body == null) { Reply("error", "메시지를 읽을 수 없습니다."); return; }
                Dictionary<string, object> msg = null;
                try
                {
                    JavaScriptSerializer ser = new JavaScriptSerializer();
                    ser.MaxJsonLength = 8 * 1024 * 1024;
                    msg = ser.DeserializeObject(body) as Dictionary<string, object>;
                }
                catch { Reply("error", "요청 형식이 올바르지 않습니다."); return; }
                if (msg == null) { Reply("error", "요청을 해석할 수 없습니다."); return; }

                string cmd = GetString(msg, "cmd");
                if (string.IsNullOrEmpty(cmd)) cmd = GetString(msg, "type");
                if (cmd == null) { Reply("error", "명령이 없습니다."); return; }

                try
                {
                    if (cmd == "discover") HandleDiscover();
                    else if (cmd == "load") HandleLoad(msg);
                    else if (cmd == "save") HandleSave(msg);
                    else if (cmd == "export") HandleExport(msg);
                    else if (cmd == "ready") Reply("ready", null);
                    else Reply("error", "알 수 없는 명령입니다: " + cmd);
                }
                catch (Exception ex)
                {
                    Reply("error", "처리 중 오류: " + ex.Message);
                }
            }

            private void HandleDiscover()
            {
                object result = SaveEditor.Invoke("DiscoverSaveSlots", new object[] { });
                Reply("discover", result);
            }

            private void HandleLoad(Dictionary<string, object> msg)
            {
                string index = GetString(msg, "index");
                if (index == null) index = GetString(msg, "path");
                if (string.IsNullOrEmpty(index)) { Reply("error", "불러올 세이브를 선택하세요."); return; }
                object result = SaveEditor.Invoke("LoadSlot", new object[] { index });
                Reply("load", result);
            }

            private void HandleSave(Dictionary<string, object> msg)
            {
                string index = GetString(msg, "index");
                string data = GetString(msg, "data");
                if (string.IsNullOrEmpty(index)) { Reply("error", "저장 대상이 지정되지 않았습니다."); return; }
                if (data == null) { Reply("error", "저장 데이터가 없습니다."); return; }
                byte[] bytes;
                try { bytes = Convert.FromBase64String(data); }
                catch { Reply("error", "저장 데이터 형식이 올바르지 않습니다."); return; }

                int max = GetMaxSaveBytes();
                if (max > 0 && bytes.Length > max)
                {
                    Reply("error", "세이브 파일 크기가 허용 범위를 넘습니다: " + bytes.Length + " 바이트");
                    return;
                }

                object result = Invoke2("ReplaceBatch",
                    new object[] { index },
                    new object[] { index, bytes });
                Reply("save", result);
            }

            private void HandleExport(Dictionary<string, object> msg)
            {
                string index = GetString(msg, "index");
                string data = GetString(msg, "data");
                if (string.IsNullOrEmpty(index)) { Reply("error", "내보낼 세이브를 선택하세요."); return; }
                byte[] bytes = null;
                if (data != null)
                {
                    try { bytes = Convert.FromBase64String(data); }
                    catch { Reply("error", "내보낼 데이터 형식이 올바르지 않습니다."); return; }
                }
                object result = Invoke2("ExportSlot",
                    new object[] { index },
                    new object[] { index, bytes });
                Reply("export", result);
            }

            private static object Invoke2(string name, object[] a1, object[] a2)
            {
                try { return SaveEditor.Invoke(name, a1); }
                catch (MissingMethodException) { return SaveEditor.Invoke(name, a2); }
            }

            private static int GetMaxSaveBytes()
            {
                try
                {
                    PropertyInfo p = typeof(SaveStore).GetProperty("MaxSaveBytes", BindingFlags.Public | BindingFlags.Static);
                    if (p != null)
                    {
                        object v = p.GetValue(null, null);
                        if (v is int) return (int)v;
                        if (v is long) return (int)(long)v;
                        if (v != null) return Convert.ToInt32(v, CultureInfo.InvariantCulture);
                    }
                    FieldInfo f = typeof(SaveStore).GetField("MaxSaveBytes", BindingFlags.Public | BindingFlags.Static);
                    if (f != null)
                    {
                        object v = f.GetValue(null);
                        if (v is int) return (int)v;
                        if (v is long) return (int)(long)v;
                        if (v != null) return Convert.ToInt32(v, CultureInfo.InvariantCulture);
                    }
                }
                catch { }
                return 0;
            }

            private static string GetString(Dictionary<string, object> d, string key)
            {
                if (d == null || key == null) return null;
                object v;
                if (!d.TryGetValue(key, out v) || v == null) return null;
                if (v is string) return (string)v;
                return Convert.ToString(v, CultureInfo.InvariantCulture);
            }

            private void Reply(string kind, object payload)
            {
                try
                {
                    JavaScriptSerializer ser = new JavaScriptSerializer();
                    ser.MaxJsonLength = 16 * 1024 * 1024;
                    Dictionary<string, object> r = new Dictionary<string, object>();
                    r["kind"] = kind;
                    r["ok"] = (kind != "error");
                    if (payload != null) r["payload"] = payload;
                    string json = ser.Serialize(r);
                    if (web != null && web.CoreWebView2 != null && ready)
                    {
                        web.CoreWebView2.PostWebMessageAsString(json);
                    }
                }
                catch { }
            }
        }
    }
}
