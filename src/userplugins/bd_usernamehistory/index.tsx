import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

function BdPluginInfoComponent() {
    const status = instance ? "Running" : "Stopped";
    return (
        <div style={{ padding: "16px", backgroundColor: "var(--background-secondary)", borderRadius: "8px", marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "16px" }}>UsernameHistory</h3>
            <p style={{ margin: "0 0 4px", color: "var(--text-muted)" }}>Status: {status}</p>
            <p style={{ margin: "0", color: "var(--text-muted)", fontSize: "13px" }}>BetterDiscord plugin running inside Vencord</p>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "13px" }}>Author: salty</p>
        </div>
    );
}

const settings = definePluginSettings({
    _info: {
        type: OptionType.COMPONENT,
        description: "",
        component: BdPluginInfoComponent
    }
});

function createBdApi(): any {
    function resolveModule(path: string) {
        try { return require(path); } catch { return null; }
    }
    var _a = resolveModule("@webpack/common") || {} as any;
    var React = _a.React, UserStore = _a.UserStore, GuildStore = _a.GuildStore, ChannelStore = _a.ChannelStore, RelationshipStore = _a.RelationshipStore, FluxDispatcher = _a.FluxDispatcher;
    var _b = resolveModule("@webpack") || {} as any, findByProps = _b.findByProps, find = _b.find, findAll = _b.findAll, findByCodeLazy = _b.findByCodeLazy;
    var _c = resolveModule("@webpack/patcher") || {} as any, Patcher = _c.Patcher;
    var _d = resolveModule("@utils/discord") || {} as any, showToastFn = _d.showToast;
    var _data = {};
    var _injectedCss = [];
    var PN = "UsernameHistory";
    function lsKey(pn, k) { return "bd_" + pn + "_" + k; }
    return {
        get React() { return React; },
        Patcher: {
            after: function(c, m, f, cb) { try { Patcher?.after(c, m, f, cb); } catch {} },
            before: function(c, m, f, cb) { try { Patcher?.before(c, m, f, cb); } catch {} },
            unpatchAll: function(c) { try { Patcher?.unpatchAll(c); } catch {} }
        },
        Webpack: {
            getStore: function(n) { var stores = { UserStore: UserStore, GuildStore: GuildStore, ChannelStore: ChannelStore, RelationshipStore: RelationshipStore }; return stores[n] || null; },
            getBySource: function() { try { return findByCodeLazy?.(arguments[0]); } catch { return null; } },
            getMangled: function(_s, mappings) { try { for (var _i in mappings) { var f = mappings[_i]; if (typeof f === "function") return f(React); } } catch {} return null; },
            waitForModule: function(filter) {
                return new Promise(function(resolve) {
                    try {
                        var m = find?.(filter);
                        if (m) return resolve(m);
                        var unsub = FluxDispatcher?.subscribe("CONNECTION_OPEN", function() {
                            var m2 = find?.(filter);
                            if (m2) { unsub(); resolve(m2); }
                        });
                        setTimeout(function() { unsub?.(); resolve(find?.(filter) || {}); }, 30000);
                    } catch { setTimeout(function() { resolve({}); }, 1000); }
                });
            },
            Filters: { byStrings: function() { var ss = Array.prototype.slice.call(arguments); return function(m) { if (!m) return false; var s = String(m); return ss.every(function(x) { return s.includes(x); }); }; } }
        },
        Data: {
            load: function(k, sub) {
                var pn = sub !== undefined ? k : PN;
                var key = sub !== undefined ? sub : k;
                if (_data[pn]?.[key] !== undefined) return _data[pn][key];
                try { var v = localStorage.getItem("bd_" + pn + "_" + key); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
            },
            save: function(k, sub, v) {
                var pn = v !== undefined ? k : PN;
                var key = v !== undefined ? sub : k;
                var val = v !== undefined ? v : sub;
                if (!_data[pn]) _data[pn] = {};
                _data[pn][key] = val;
                try { localStorage.setItem("bd_" + pn + "_" + key, JSON.stringify(val)); } catch {}
            },
            delete: function(k, sub) {
                var pn = sub !== undefined ? k : PN;
                var key = sub !== undefined ? sub : k;
                if (_data[pn]) delete _data[pn][key];
                try { localStorage.removeItem("bd_" + pn + "_" + key); } catch {}
            }
        },
        loadData: function(p, k) { return this.Data.load(p, k); },
        saveData: function(p, k, v) { this.Data.save(p, k, v); },
        UI: {
            showChangelogModal: function(opts) { console.log("[BdApi] Changelog:", opts); },
            showToast: function(msg, t) { try { showToastFn?.(msg, t); } catch {} }
        },
        DOM: {
            addStyle: function(id, css) { try { var el = document.createElement("style"); el.id = id; el.textContent = css; document.head.appendChild(el); _injectedCss.push(id); } catch {} },
            removeStyle: function(id) { try { document.getElementById(id)?.remove(); } catch {} }
        },
        findModuleByProps: function() { try { return findByProps?.(...arguments); } catch { return null; } },
        findAllModules: function(f) { try { return findAll?.(f) || []; } catch { return []; } },
        injectCSS: function(id, css) { this.DOM.addStyle(id, css); },
        clearCSS: function(id) { this.DOM.removeStyle(id); },
        showToast: function(msg, opts) { this.UI.showToast(msg, opts); }
    };
}

const BD_SOURCE = atob("77u/LyoqCiAqIEBuYW1lIFVzZXJuYW1lSGlzdG9yeQogKiBAYXV0aG9yIHNhbHR5CiAqIEBhdXRob3JJZCA0MDkyNTA4NDA1NzEwMTkyNjQKICogQHZlcnNpb24gMS4xLjAKICogQGRlc2NyaXB0aW9uIEtlZXAgdHJhY2sgb2Ygd2hvIGlzIHdobyBieSBzZWVpbmcgeW91ciBmcmllbmRzJyB1c2VybmFtZSBoaXN0b3J5LgogKiBAZG9uYXRlIGh0dHBzOi8vZ2l0aHViLmNvbS9zcG9uc29ycy9TYWx0eS1Db2RlcgogKiBAd2Vic2l0ZSBodHRwczovL2dpdGh1Yi5jb20vU2FsdHktQ29kZXIvVXNlcm5hbWVIaXN0b3J5CiAqIEBzb3VyY2UgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1NhbHR5LUNvZGVyL1VzZXJuYW1lSGlzdG9yeS9tYWluL1VzZXJuYW1lSGlzdG9yeS5wbHVnaW4uanMKICogQHVwZGF0ZVVybCBodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vU2FsdHktQ29kZXIvVXNlcm5hbWVIaXN0b3J5L21haW4vVXNlcm5hbWVIaXN0b3J5LnBsdWdpbi5qcwogKi8KCmNvbnN0IGNvbmZpZyA9IHsKICAgIGluZm86IHsKICAgICAgICBuYW1lOiAnVXNlcm5hbWVIaXN0b3J5JywKICAgICAgICBhdXRob3JzOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgIG5hbWU6ICdzYWx0eScsCiAgICAgICAgICAgICAgICBkaXNjb3JkX2lkOiAnNDA5MjUwODQwNTcxMDE5MjY0JywKICAgICAgICAgICAgICAgIGdpdGh1Yl91c2VybmFtZTogJ1NhbHR5LUNvZGVyJywKICAgICAgICAgICAgfSwKICAgICAgICBdLAogICAgICAgIHZlcnNpb246ICcxLjEuMCcsCiAgICAgICAgZGVzY3JpcHRpb246ICdLZWVwIHRyYWNrIG9mIHdobyBpcyB3aG8gYnkgc2VlaW5nIHlvdXIgZnJpZW5kc1wnIHVzZXJuYW1lIGhpc3RvcnkuJywKICAgICAgICBnaXRodWI6ICdodHRwczovL2dpdGh1Yi5jb20vU2FsdHktQ29kZXIvVXNlcm5hbWVIaXN0b3J5JywKICAgICAgICBnaXRodWJfcmF3OiAnaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1NhbHR5LUNvZGVyL1VzZXJuYW1lSGlzdG9yeS9tYWluL1VzZXJuYW1lSGlzdG9yeS5wbHVnaW4uanMnLAogICAgfSwKICAgIGNoYW5nZWxvZzogWwoJCXsKICAgICAgICAgICAgdGl0bGU6ICcxLjEuMCcsCiAgICAgICAgICAgIHR5cGU6ICdwcm9ncmVzcycsCiAgICAgICAgICAgIGl0ZW1zOiBbCiAgICAgICAgICAgICAgICAnRml4ZWQgYW5kIGVuaGFuY2VkLicsCiAgICAgICAgICAgIF0sCiAgICAgICAgfQogICAgXSwKfTsKCmNvbnN0IHsgQmRBcGkgfSA9IHdpbmRvdzsKCmNvbnN0IHsgRGF0YSwgVUksIFV0aWxzLCBET00gfSA9IEJkQXBpOwoKY29uc3Qge1dlYnBhY2t9ID0gQmRBcGk7CmNvbnN0IFVzZXJTdG9yZSA9IFdlYnBhY2suZ2V0U3RvcmUoIlVzZXJTdG9yZSIpOwpjb25zdCBSZWxhdGlvbnNoaXBTdG9yZSA9IFdlYnBhY2suZ2V0U3RvcmUoIlJlbGF0aW9uc2hpcFN0b3JlIik7Cgpjb25zdCBzdWJzY3JpYmVUYXJnZXRzID0gWwoJJ0ZSSUVORF9SRVFVRVNUX0FDQ0VQVEVEJywKCSdSRUxBVElPTlNISVBfQUREJywKCSdSRUxBVElPTlNISVBfVVBEQVRFJywKCSdSRUxBVElPTlNISVBfUkVNT1ZFJywKXTsKCmxldCBjdXJyZW50Q2FjaGVkRGF0YTsgIC8vIENhY2hlZCB3aGlsZSBydW5uaW5nIHBsdWdpbgpsZXQgaXNVcGRhdGluZyA9IGZhbHNlOwpsZXQgaXNJbXBvcnRpbmcgPSBmYWxzZTsKCmNvbnN0IFsgYWJvcnQsIGdldFNpZ25hbCBdID0gKGZ1bmN0aW9uICgpIHsKCWxldCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpOwoKCWZ1bmN0aW9uIGFib3J0KHJlYXNvbikgewoJICBjb250cm9sbGVyLmFib3J0KHJlYXNvbik7CgkgIGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7Cgl9CgoJcmV0dXJuIFthYm9ydCwgKCkgPT4gY29udHJvbGxlci5zaWduYWxdOwogIH0pKCk7CgovLyBSZXR1cm5zIHRoZSBkYXRhIGN1cnJlbnRseSBzdG9yZWQgaW4gdGhlIGRiIGZpbGUKY29uc3QgZ2V0U3RvcmVkRGF0YSA9ICgpID0+IHsgCgljb25zdCBzdG9yZWREYXRhID0gRGF0YS5sb2FkKGAke2NvbmZpZy5pbmZvLm5hbWV9X2RiYCwgJ3NhdmVkRGF0YScpOwoJaWYgKCFzdG9yZWREYXRhKSByZXR1cm4gdW5kZWZpbmVkOwoJcmV0dXJuIHN0b3JlZERhdGE7Cn07CgoKY29uc3QgZ2V0RnJpZW5kc0xpc3QgPSAoKSA9PiB7Cgljb25zdCByZWxhdGlvbnNoaXBzID0gUmVsYXRpb25zaGlwU3RvcmUuZ2V0RnJpZW5kSURzKCk7Cgljb25zdCBmcmllbmRzQXJyID0ge307CgoJcmVsYXRpb25zaGlwcy5mb3JFYWNoKChyZWxhdGlvbnNoaXApID0+IHsKCQljb25zdCB1c2VyID0gVXNlclN0b3JlLmdldFVzZXIocmVsYXRpb25zaGlwLnRvU3RyaW5nKCkpOwoJCWlmICh1c2VyKSB7CgkJCWNvbnN0IGZpbHRlcmVkVXNlciA9IHsKCQkJCXVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lLAoJCQl9OwoJCQlmcmllbmRzQXJyW3VzZXIuaWRdID0gZmlsdGVyZWRVc2VyOwoJCX0KCX0pOwoKCXJldHVybiB7IGZyaWVuZHNBcnIgfTsKfTsKCi8vIFNldHMgY2FjaGVkIGRhdGEgdG8gY3VycmVudGx5IGZyaWVuZCBsaXN0CmNvbnN0IHBvcHVsYXRlRW1wdHlDdXJyZW50U2F2ZWREYXRhID0gKCkgPT4gewoJY29uc3QgZnJpZW5kc0xpc3QgPSBnZXRGcmllbmRzTGlzdCgpOwoJY3VycmVudENhY2hlZERhdGEuZnJpZW5kQ2FjaGUgPSBmcmllbmRzTGlzdC5mcmllbmRzQXJyOwoJY29uc29sZS5sb2coYFVzZXJuYW1lSGlzdG9yeTogQ2FjaGluZyAke09iamVjdC5rZXlzKGZyaWVuZHNMaXN0LmZyaWVuZHNBcnIpLmxlbmd0aH0gZnJpZW5kcy5gKTsKfTsKCmNvbnN0IGluaXRpYWxpemVDdXJyZW50Q2FjaGVkRGF0YSA9ICgpID0+IHsgIC8vIFJhbiBmaXJzdAoJY29uc3Qgc3RvcmVkRGF0YUluRmlsZSA9IGdldFN0b3JlZERhdGEoKTsKCglpZiAoIXN0b3JlZERhdGFJbkZpbGUpIHsgICAvLyBJZiBubyBkYXRhIGlzIGFscmVhZHkgc3RvcmVkIGluIGpzb24gZmlsZToKCQljb25zdCBlbXB0eUNhY2hlZERhdGEgPSB7ZnJpZW5kQ2FjaGU6IFtdfTsKCQljdXJyZW50Q2FjaGVkRGF0YSA9IGVtcHR5Q2FjaGVkRGF0YTsgLy8gQ3VycmVudCBtZW1vcnkgc2F2ZWQgZGF0YSA9IFtdCgkJcG9wdWxhdGVFbXB0eUN1cnJlbnRTYXZlZERhdGEoKTsgLy8gUG9wdWxhdGUgdGhlIGVtcHR5IHRhYmxlCgl9IGVsc2UgeyAgICAgICAgICAgIC8vIElmIHNhdmVkIGRhdGEgaXMgcHJlc2VudCBpbiBqc29uIGZpbGU6CgkJY3VycmVudENhY2hlZERhdGEgPSBzdG9yZWREYXRhSW5GaWxlOyAgLy8gQ3VycmVudCBtZW1vcnkgZGF0YSA9IHRoZSBjdXJyZW50IGRhdGEgZnJvbSBqc29uIGZpbGUKCX0KCWNvbXBhcmVBbmRVcGRhdGVDdXJyZW50Q2FjaGVkRGF0YSgpCn07Cgpjb25zdCBjb21wYXJlQW5kVXBkYXRlQ3VycmVudENhY2hlZERhdGEgPSAoKSA9PiB7ICAvLyBSYW4gYWZ0ZXIgaW5pdGlhbGl6ZUN1cnJlbnRDYWNoZWREYXRhIGFuZCBsb29wZWQKCWlmIChpc1VwZGF0aW5nID09PSB0cnVlIHx8IGlzSW1wb3J0aW5nID09PSB0cnVlKSByZXR1cm4gbnVsbDsKICAgIGlzVXBkYXRpbmcgPSB0cnVlOwoJdHJ5IHsKCQkKCQlsZXQgY3VycmVudFN0b3JlZERhdGEgPSBnZXRTdG9yZWREYXRhKCkgfHwgeyBmcmllbmRDYWNoZToge30gfTsgLy8gTG9hZCBzdG9yZWQgZGF0YQogICAgICAgIGxldCBjdXJyZW50RnJpZW5kVXNlcm5hbWVzID0gZ2V0RnJpZW5kc0xpc3QoKS5mcmllbmRzQXJyOyAvLyBHZXQgY3VycmVudCBmcmllbmQgZGF0YQoKCQlmb3IgKGxldCB1c2VySWQgaW4gY3VycmVudEZyaWVuZFVzZXJuYW1lcykgewogICAgICAgICAgICBsZXQgY3VycmVudFVzZXJuYW1lID0gY3VycmVudEZyaWVuZFVzZXJuYW1lc1t1c2VySWRdLnVzZXJuYW1lOwoKICAgICAgICAgICAgaWYgKCFjdXJyZW50U3RvcmVkRGF0YS5mcmllbmRDYWNoZS5oYXNPd25Qcm9wZXJ0eSh1c2VySWQpKSB7CiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBpcyBub3QgaW4gdGhlIGRhdGFiYXNlIGF0IGFsbCwgYWRkIHRoZW0KICAgICAgICAgICAgICAgIGN1cnJlbnRTdG9yZWREYXRhLmZyaWVuZENhY2hlW3VzZXJJZF0gPSB7ICJ1c2VybmFtZXMiOiBbY3VycmVudFVzZXJuYW1lXSB9OwogICAgICAgICAgICB9IGVsc2UgewogICAgICAgICAgICAgICAgLy8gSWYgdGhlIHVzZXIgZXhpc3RzLCBjaGVjayBpZiB0aGUgdXNlcm5hbWUgaXMgbmV3CiAgICAgICAgICAgICAgICBpZiAoIWN1cnJlbnRTdG9yZWREYXRhLmZyaWVuZENhY2hlW3VzZXJJZF0udXNlcm5hbWVzLmluY2x1ZGVzKGN1cnJlbnRVc2VybmFtZSkpIHsKICAgICAgICAgICAgICAgICAgICBjdXJyZW50U3RvcmVkRGF0YS5mcmllbmRDYWNoZVt1c2VySWRdLnVzZXJuYW1lcy5wdXNoKGN1cnJlbnRVc2VybmFtZSk7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0KICAgICAgICB9CgkJY3VycmVudENhY2hlZERhdGEgPSBjdXJyZW50U3RvcmVkRGF0YTsgLy8gVXBkYXRlIG1lbW9yeSBjYWNoZQogICAgICAgIERhdGEuc2F2ZShgJHtjb25maWcuaW5mby5uYW1lfV9kYmAsICdzYXZlZERhdGEnLCBjdXJyZW50U3RvcmVkRGF0YSk7IC8vIFNhdmUgdG8gZGIgZmlsZQoKCgoJfSBjYXRjaCAoZSkgewoJCWNvbnNvbGUuZXJyb3IoIkVycm9yIHVwZGF0aW5nIGZyaWVuZCB1c2VybmFtZSBkYXRhOiIsIGUpOwoJCXRocm93IGU7Cgl9IGZpbmFsbHkgewoJCWlzVXBkYXRpbmcgPSBmYWxzZTsKCX0KCglyZXR1cm47Cn07CgoKCgoKbGV0IFRleHQgPSBCZEFwaS5XZWJwYWNrLmdldEJ5U291cmNlKCJkYXRhLXRleHQtdmFyaWFudCIsICI9XCJkaXZcIixzZWxlY3RhYmxlOiIsIHsgZGVmYXVsdEV4cG9ydDogZmFsc2UgfSk7CmlmICghVGV4dC5yZW5kZXIpIFRleHQgPSBPYmplY3QudmFsdWVzKFRleHQpWzBdOwoKCmNvbnN0IHtpbnRsfSA9IEJkQXBpLldlYnBhY2suZ2V0TWFuZ2xlZCgiLkludGxNYW5hZ2VyKCIsIHsKICAgIGludGw6IG0gPT4gbT8uY3VycmVudExvY2FsZQp9KTsKCmZ1bmN0aW9uIGdldE1lc3NhZ2UoKSB7Cglzd2l0Y2ggKGludGwuY3VycmVudExvY2FsZSkgewogICAgCWRlZmF1bHQ6IHJldHVybiAiVXNlcm5hbWUgSGlzdG9yeSI7Cgl9Cn0KCgovLyBDdXN0b20gU2VjdGlvbiBDb21wb25lbnQKY2xhc3MgVXNlcm5hbWVIaXN0b3J5U2VjdGlvbiBleHRlbmRzIEJkQXBpLlJlYWN0LkNvbXBvbmVudCB7CiAgY29uc3RydWN0b3IocHJvcHMpIHsKCXN1cGVyKHByb3BzKTsKCiAgfQoKICBzdGF0ZSA9IHsgaGFzRXJyb3I6IGZhbHNlIH07CgogIFVOSGlzdG9yeSA9IG51bGwKCiAgcmVuZGVyKCkgewogICAgaWYgKHRoaXMuc3RhdGUuaGFzRXJyb3IpIHJldHVybiBCZEFwaS5SZWFjdC5jcmVhdGVFbGVtZW50KCJkaXYiLCB7fSwgIlJlYWN0IEVycm9yIik7Cgljb25zdCB7IHVzZXJJZCwgY3VycmVudE5hbWV9ID0gdGhpcy5wcm9wczsKCWlmICghY3VycmVudENhY2hlZERhdGEuZnJpZW5kQ2FjaGUgfHwgIWN1cnJlbnRDYWNoZWREYXRhLmZyaWVuZENhY2hlW3VzZXJJZF0pIHJldHVybiBudWxsOwoKCWNvbnN0IHVzZXJEYXRhID0gY3VycmVudENhY2hlZERhdGEuZnJpZW5kQ2FjaGVbdXNlcklkXTsKCglpZih1c2VyRGF0YS51c2VybmFtZXMuaW5jbHVkZXMoY3VycmVudE5hbWUpKXsKCQljb25zdCBpbmRleCA9IHVzZXJEYXRhLnVzZXJuYW1lcy5pbmRleE9mKGN1cnJlbnROYW1lKTsKCQlpZiAoaW5kZXggPiAtMSkgeyAvLyBvbmx5IHNwbGljZSBhcnJheSB3aGVuIGl0ZW0gaXMgZm91bmQKCQkJdXNlckRhdGEudXNlcm5hbWVzLnNwbGljZShpbmRleCwgMSk7IC8vIDJuZCBwYXJhbWV0ZXIgbWVhbnMgcmVtb3ZlIG9uZSBpdGVtIG9ubHkKCQl9Cgl9CgoJcmV0dXJuIEJkQXBpLlJlYWN0LmNyZWF0ZUVsZW1lbnQoU2VjdGlvbiwgewoJCWhlYWRpbmc6IGdldE1lc3NhZ2UoKSwKCQloZWFkaW5nQ29sb3I6IHRoaXMucHJvcHMuc2lkZVBhbmVsID8gImhlYWRlci1wcmltYXJ5IiA6IHVuZGVmaW5lZCwKCQljaGlsZHJlbjogWwoJCQl1c2VyRGF0YS51c2VybmFtZXMuc2xpY2UoKS5yZXZlcnNlKCkubWFwKCh1c2VybmFtZSwgaW5kZXgpID0+IAoJCQkJQmRBcGkuUmVhY3QuY3JlYXRlRWxlbWVudCgiZGl2IiwgeyBrZXk6IGluZGV4LCBzdHlsZTogeyBkaXNwbGF5OiAiZmxleCIsIGFsaWduSXRlbXM6ICJjZW50ZXIiIH0gfSwKCQkJCQlCZEFwaS5SZWFjdC5jcmVhdGVFbGVtZW50KCJzdmciLCB7IAoJCQkJCQl3aWR0aDogMjAsIGhlaWdodDogMjAsIHZpZXdCb3g6ICIwIDAgMjQgMjQiLCBzdHlsZTogeyBtYXJnaW5SaWdodDogIjVweCIgfSAKCQkJCQl9LCAKCQkJCQkJQmRBcGkuUmVhY3QuY3JlYXRlRWxlbWVudCgicGF0aCIsIHsgZmlsbDogIndoaXRlIiwgZDogIk04LjcwNyAxOS43MDcgMTggMTAuNDE0IDEzLjU4NiA2bC05LjI5MyA5LjI5M2ExLjAwMyAxLjAwMyAwIDAgMC0uMjYzLjQ2NEwzIDIxbDUuMjQyLTEuMDNjLjE3Ni0uMDQ0LjMzNy0uMTM1LjQ2NS0uMjYzek0yMSA3LjQxNGEyIDIgMCAwIDAgMC0yLjgyOEwxOS40MTQgM2EyIDIgMCAwIDAtMi44MjggMEwxNSA0LjU4NiAxOS40MTQgOSAyMSA3LjQxNHoiIH0pCgkJCQkJKSwKCQkJCQlCZEFwaS5SZWFjdC5jcmVhdGVFbGVtZW50KFRleHQsIHsgdmFyaWFudDogInRleHQtc20vbm9ybWFsIiB9LCB1c2VybmFtZSkKCQkJCSkKCQkJKQoJCV0KCX0pCiAgfQp9CgoKCgoKCgoKCgpsZXQgVXNlck1vZGFsQ29udGVudDsKYXN5bmMgZnVuY3Rpb24gcGF0Y2hVc2VyTW9kYWwoc2lnbmFsKSB7CiAgICBpZiAoIVVzZXJNb2RhbENvbnRlbnQpIHsKCQlVc2VyTW9kYWxDb250ZW50ID0gYXdhaXQgQmRBcGkuV2VicGFjay53YWl0Rm9yTW9kdWxlKAoJCQlCZEFwaS5XZWJwYWNrLkZpbHRlcnMuYnlTdHJpbmdzKCIzZmU3VTEiLCAidHJhY2tVc2VyUHJvZmlsZUFjdGlvbiIpLAoJCQl7IGRlZmF1bHRFeHBvcnQ6IGZhbHNlIH0KCQkpOwogICAgICAgIAoJCWlmICghKCJkZWZhdWx0IiBpbiBVc2VyTW9kYWxDb250ZW50KSkgewogICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoVXNlck1vZGFsQ29udGVudCwgImRlZmF1bHQiLCB7CiAgICAgICAgICAgICAgICBnZXQoKSB7CiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFVzZXJNb2RhbENvbnRlbnQuWiB8fCBVc2VyTW9kYWxDb250ZW50LlpQOwogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHNldCh2YWx1ZSkgewogICAgICAgICAgICAgICAgICAgIGlmICgiWiIgaW4gVXNlck1vZGFsQ29udGVudCkgVXNlck1vZGFsQ29udGVudC5aID0gdmFsdWU7CiAgICAgICAgICAgICAgICAgICAgaWYgKCJaUCIgaW4gVXNlck1vZGFsQ29udGVudCkgVXNlck1vZGFsQ29udGVudC5aUCA9IHZhbHVlOwogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9KTsKICAgICAgICB9CiAgICB9CgogICAgaWYgKHNpZ25hbC5hYm9ydGVkKSByZXR1cm47CgogICAgQmRBcGkuUGF0Y2hlci5hZnRlcigiVXNlcm5hbWVIaXN0b3J5IiwgVXNlck1vZGFsQ29udGVudCwgImRlZmF1bHQiLCAoaW5zdGFuY2UsIFtwcm9wc10sIHJlcykgPT4gewogICAgICAgIGlmICghQmRBcGkuUmVhY3QuaXNWYWxpZEVsZW1lbnQocmVzKSkgcmV0dXJuOwogICAgICAgIGNvbnN0IGNoaWxkcmVuID0gcmVzLnByb3BzLmNoaWxkcmVuOwoKCQljb25zdCBpbmRleCA9IGNoaWxkcmVuLmZpbmRJbmRleCgKCQkJKHZhbHVlKSA9PgoJCQkgIEJkQXBpLlJlYWN0LmlzVmFsaWRFbGVtZW50KHZhbHVlKSAmJgoJCQkgICJoZWFkaW5nIiBpbiB2YWx1ZS5wcm9wcyAmJgoJCQkgIEJkQXBpLlJlYWN0LmlzVmFsaWRFbGVtZW50KHZhbHVlLnByb3BzLmNoaWxkcmVuKSAmJgoJCQkgICJ0b29sdGlwRGVsYXkiIGluIHZhbHVlLnByb3BzLmNoaWxkcmVuLnByb3BzCgkJICApOwoKICAgICAgICBpZiAofmluZGV4KSB7CgkJCVNlY3Rpb24gPSBjaGlsZHJlbltpbmRleF0udHlwZTsKCiAgICAgICAgICAgIGNoaWxkcmVuLnNwbGljZSgKICAgICAgICAgICAgICAgIGluZGV4ICsgMSwgMCwKICAgICAgICAgICAgICAgIEJkQXBpLlJlYWN0LmNyZWF0ZUVsZW1lbnQoVXNlcm5hbWVIaXN0b3J5U2VjdGlvbiwgewoJCQkJCXVzZXJJZDogcHJvcHMudXNlci5pZCwKCQkJCQljdXJyZW50TmFtZTogcHJvcHMudXNlci51c2VybmFtZQoJCQkJfSkKICAgICAgICAgICAgKTsKICAgICAgICB9CiAgICB9KTsKfQoKCgpsZXQgVXNlclNpZGVQYW5lbDsKYXN5bmMgZnVuY3Rpb24gcGF0Y2hTaWRlUGFuZWwoc2lnbmFsKSB7CiAgICBpZiAoIVVzZXJTaWRlUGFuZWwpIHsKICAgIAlVc2VyU2lkZVBhbmVsID0gYXdhaXQgQmRBcGkuV2VicGFjay53YWl0Rm9yTW9kdWxlKEJkQXBpLldlYnBhY2suRmlsdGVycy5ieVN0cmluZ3MoIjYxVzMzZCIsICJVc2VyUHJvZmlsZVBhbmVsQm9keSIpLCB7IGRlZmF1bHRFeHBvcnQ6IGZhbHNlIH0pOwoKICAgICAgCWlmICghKCJkZWZhdWx0IiBpbiBVc2VyU2lkZVBhbmVsKSkgewogICAgICAgIAlPYmplY3QuZGVmaW5lUHJvcGVydHkoVXNlclNpZGVQYW5lbCwgImRlZmF1bHQiLCB7CiAgICAgICAgICAJCWdldCgpIHsKICAgICAgICAgICAgCQlyZXR1cm4gVXNlclNpZGVQYW5lbC5aIHx8IFVzZXJTaWRlUGFuZWwuWlA7CiAgICAgICAgICAJCX0sCiAgICAgICAgICAJCXNldCh2YWx1ZSkgewogICAgICAgICAgICAJCWlmICgiWiIgaW4gVXNlclNpZGVQYW5lbCkgVXNlclNpZGVQYW5lbC5aID0gdmFsdWU7CiAgICAgICAgICAgIAkJaWYgKCJaUCIgaW4gVXNlclNpZGVQYW5lbCkgVXNlclNpZGVQYW5lbC5aUCA9IHZhbHVlOwogICAgICAgICAgCQl9CiAgICAgICAgCX0pOwogICAgICAJfTsKICAgIH0KCiAgICBpZiAoc2lnbmFsLmFib3J0ZWQpIHJldHVybjsKCiAgICBCZEFwaS5QYXRjaGVyLmFmdGVyKCJVc2VybmFtZUhpc3RvcnkiLCBVc2VyU2lkZVBhbmVsLCAiZGVmYXVsdCIsIChpbnN0YW5jZSwgWyBwcm9wcywgYWJjIF0sIHJlcykgPT4gewogICAgICBpZiAoIUJkQXBpLlJlYWN0LmlzVmFsaWRFbGVtZW50KHJlcykpIHJldHVybjsKCiAgICAgIGNvbnN0IGJhY2tncm91bmQgPSByZXMucHJvcHMuY2hpbGRyZW4uZmluZCgodmFsdWUpID0+IFN0cmluZyh2YWx1ZT8ucHJvcHM/LmNsYXNzTmFtZSkuaW5jbHVkZXMoIm92ZXJsYXlfIikpOwogICAgICBpZiAoIWJhY2tncm91bmQpIHJldHVybjsKICAgICAgCiAgICAgIGNvbnN0IGluZGV4ID0gYmFja2dyb3VuZC5wcm9wcy5jaGlsZHJlbi5maW5kSW5kZXgoKHZhbHVlKSA9PiBCZEFwaS5SZWFjdC5pc1ZhbGlkRWxlbWVudCh2YWx1ZSkgJiYgImhlYWRpbmciIGluIHZhbHVlLnByb3BzKTsKCiAgICAgIGlmICh+aW5kZXgpIHsgICAgICAgIAogICAgICAgIFNlY3Rpb24gPSBiYWNrZ3JvdW5kLnByb3BzLmNoaWxkcmVuW2luZGV4XS50eXBlOwogICAgICAgIAogICAgICAgIGJhY2tncm91bmQucHJvcHMuY2hpbGRyZW4ucHVzaCgKICAgICAgICAgIEJkQXBpLlJlYWN0LmNyZWF0ZUVsZW1lbnQoVXNlcm5hbWVIaXN0b3J5U2VjdGlvbiwgewogICAgICAgICAgICB1c2VySWQ6IHByb3BzLnVzZXIuaWQsCgkJCWN1cnJlbnROYW1lOiBwcm9wcy51c2VyLnVzZXJuYW1lLAogICAgICAgICAgICBzaWRlUGFuZWw6IHRydWUKICAgICAgICAgIH0pCiAgICAgICAgKTsKICAgICAgfQogICAgfSk7CiAgfQoKCgoKCgoKCgoKbW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBVc2VybmFtZUhpc3RvcnkgewoKCWNvbnN0cnVjdG9yKG1ldGEpIHsKCQl0aGlzLm1ldGEgPSBtZXRhOwoJCXRoaXMuY29uZmlnID0gY29uZmlnOwoJfQoKCWdldE5hbWUoKSB7IHJldHVybiB0aGlzLmNvbmZpZy5pbmZvLm5hbWU7IH0KICAgIGdldEF1dGhvcigpIHsgcmV0dXJuIHRoaXMuY29uZmlnLmluZm8uYXV0aG9ycy5tYXAoKGEpID0+IGEubmFtZSkuam9pbignLCAnKTsgfQogICAgZ2V0VmVyc2lvbigpIHsgcmV0dXJuIHRoaXMuY29uZmlnLmluZm8udmVyc2lvbjsgfQogICAgZ2V0RGVzY3JpcHRpb24oKSB7IHJldHVybiB0aGlzLmNvbmZpZy5pbmZvLmRlc2NyaXB0aW9uOyB9CgoKCXN0YXJ0ICgpIHsKCgkJY29uc3QgbGFzdFZlcnNpb24gPSBEYXRhLmxvYWQoY29uZmlnLmluZm8ubmFtZSwgJ2xhc3RWZXJzaW9uJyk7CiAgICAgICAgaWYgKGxhc3RWZXJzaW9uICE9PSB0aGlzLm1ldGEudmVyc2lvbikgewogICAgICAgICAgICBCZEFwaS5VSS5zaG93Q2hhbmdlbG9nTW9kYWwoewogICAgICAgICAgICAgICAgdGl0bGU6IHRoaXMubWV0YS5uYW1lLAogICAgICAgICAgICAgICAgc3VidGl0bGU6IHRoaXMubWV0YS52ZXJzaW9uLAogICAgICAgICAgICAgICAgY2hhbmdlczogY29uZmlnLmNoYW5nZWxvZwogICAgICAgICAgICB9KTsKICAgICAgICAgICAgQmRBcGkuRGF0YS5zYXZlKGNvbmZpZy5pbmZvLm5hbWUsICdsYXN0VmVyc2lvbicsIHRoaXMubWV0YS52ZXJzaW9uKTsKCQl9CgoKCQljb25zdCBzaWduYWwgPSBnZXRTaWduYWwoKTsKCQlwYXRjaFVzZXJNb2RhbChzaWduYWwpOwoJCXBhdGNoU2lkZVBhbmVsKHNpZ25hbCkKCgkJQmRBcGkuUGF0Y2hlci5iZWZvcmUoIlVzZXJuYW1lSGlzdG9yeSIsIEJkQXBpLmZpbmRNb2R1bGVCeVByb3BzKCJkaXNwYXRjaCIpLCAiZGlzcGF0Y2giLCAodGhpc09iamVjdCwgW2V2ZW50XSkgPT4gewoJCQlpZiAoc3Vic2NyaWJlVGFyZ2V0cy5pbmNsdWRlcyhldmVudC50eXBlKSkgewoJCQkJdXBkYXRlKGV2ZW50KTsKCQkJfQoJCX0pOwoKCQlpbml0aWFsaXplQ3VycmVudENhY2hlZERhdGEoKTsKCgkJdmFyIGxhc3RFeGVjdXRpb25UaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKS50b1N0cmluZygpOwoKCQljb25zdCB0ZW5Ib3Vyc0luTWlsbGlzZWNvbmRzID0gMTAgKiA2MCAqIDYwICogMTAwMDsgLy8gMTAgaG91cnMgaW4gbWlsbGlzZWNvbmRzCgkJLy8gTG9vcAoJCXNldEludGVydmFsKCgpID0+IHsKCQkJY29uc3QgY3VycmVudFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTsKCQkJY29uc3QgdGltZURpZmZlcmVuY2UgPSBjdXJyZW50VGltZSAtIHBhcnNlSW50KGxhc3RFeGVjdXRpb25UaW1lc3RhbXAsIDEwKTsKCQkJCQoJCQlpZiAodGltZURpZmZlcmVuY2UgPj0gdGVuSG91cnNJbk1pbGxpc2Vjb25kcykgewoJCQkJY29tcGFyZUFuZFVwZGF0ZUN1cnJlbnRDYWNoZWREYXRhKCk7CgkJCQkvLyBVcGRhdGUgdGhlIGxhc3QgZXhlY3V0aW9uIHRpbWVzdGFtcAoJCQkJbGFzdEV4ZWN1dGlvblRpbWVzdGFtcCA9ICBjdXJyZW50VGltZS50b1N0cmluZygpOwoJCQl9CgkJCX0sIDYwICogNjAgKiAxMDAwKTsgLy8gTG9vcCBldmVyeSBob3VyIC0gaW5jYXNlIG9mIHBjIHNsZWVwIGV0YyBjYXVzaW5nIG1pc3NlZCBjYWNoZXMKCgoKCX0KCgoJCQkKCglzdG9wICgpIHsKCQlhYm9ydCgpCgkJQmRBcGkuUGF0Y2hlci51bnBhdGNoQWxsKCJVc2VybmFtZUhpc3RvcnkiKTsKCX0KCn0NCg==");

let instance: any = null;

function startBdPlugin() {
    if (instance) return;
    try {
        const mod = { exports: {} };
        const BdApi = createBdApi();
        try { (window as any).BdApi = BdApi; } catch {}
        const fn = new Function("module", "exports", "BdApi", "window", BD_SOURCE);
        fn(mod, mod.exports, BdApi, window);
        const cls = mod.exports;
        if (typeof cls !== "function") {
            console.warn("[bd_usernamehistory] No class exported");
            return;
        }
        instance = new cls({ name: "UsernameHistory", version: "1.0.0" });
        if (typeof instance.start === "function")
            instance.start();
        console.log("[bd_usernamehistory] Loaded");
    } catch (e) {
        console.error("[bd_usernamehistory] Error:", e);
    }
}

function stopBdPlugin() {
    if (instance && typeof instance.stop === "function") {
        try { instance.stop(); } catch {}
    }
    instance = null;
    try { (window as any).BdApi?.Patcher?.unpatchAll("bd_usernamehistory"); } catch {}
    const styles = document.querySelectorAll("style[id^='bd_usernamehistory']");
    styles.forEach(s => s.remove());
}

export default definePlugin({
    name: "UsernameHistory",
    description: "Keep track of who is who by seeing your friends' username history (BD plugin)",
    authors: [{ name: "salty" }],
    settings,
    start() { startBdPlugin(); },
    stop() { stopBdPlugin(); }
});