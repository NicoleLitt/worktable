"""Optional end-to-end checks: Python Playwright + Chromium (not runtime dependencies)."""
from playwright.sync_api import sync_playwright, expect
import json, tempfile, subprocess, socket, os, time, uuid, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
checks=[]
def passed(label):
    checks.append(label); print('PASS',label,flush=True)
with tempfile.TemporaryDirectory(prefix='worktable-e2e-') as data:
    env={**os.environ,'DATA_DIR':data,'PORT':str(port),'ALLOW_REGISTRATION':'1'}
    server=subprocess.Popen(['node','server.js'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            with socket.socket() as sock:
                if sock.connect_ex(('127.0.0.1',port))==0: break
            time.sleep(.05)
        url=f'http://127.0.0.1:{port}'
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
            ca=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
            a=ca.new_page(); errors=[]; a.on('pageerror',lambda err:errors.append(str(err)))
            username='e2e-'+uuid.uuid4().hex[:8]; password='worktable-e2e-private'
            a.goto(url);a.get_by_role('button',name='首次使用，创建账户').click()
            a.get_by_label('用户名',exact=True).fill(username);a.get_by_label('密码（至少10字符）',exact=True).fill(password)
            a.get_by_role('button',name='创建私人账户').click();a.wait_for_selector('#selected-date')
            def nav(page,name): page.locator('nav').get_by_role('button',name=name).click()
            def date(page,value): page.locator('#selected-date').fill(value);page.locator('#selected-date').dispatch_event('change')
            def saved(page): expect(page.locator('#sync')).to_contain_text('已保存至此服务器',timeout=15000)
            def state(page): return page.evaluate("async()=> (await (await fetch('/api/state')).json())")
            def submit(page,label='保存'): page.locator('#dialog').get_by_role('button',name=label,exact=True).click()
            date(a,'2026-10-12')
            a.get_by_role('button',name='记录数量 / 耗时').click();a.get_by_label('已提交家公司数',exact=True).fill('5');a.get_by_label('实际分钟',exact=True).fill('75');a.get_by_label('备注',exact=True).fill('真实投递记录');submit(a);saved(a)
            assert state(a)['state']['habits'][1]['count']==5
            a.reload();a.wait_for_selector('#selected-date');date(a,'2026-10-12');expect(a.locator('.habit')).to_contain_text('已投 5 / 5 家')
            passed('网申数量、实际耗时保存与刷新恢复')
            for name in ['周计划','项目与成果','复盘','设置与记录']: nav(a,name);expect(a.locator('h1')).to_be_visible()
            passed('五个视图与日期切换真实可用')
            cb=browser.new_context();b=cb.new_page();b.on('pageerror',lambda err:errors.append(str(err)));b.goto(url)
            b.get_by_label('用户名',exact=True).fill(username);b.get_by_label('密码（至少10字符）',exact=True).fill(password);b.get_by_role('button',name='登录工作台',exact=True).click();b.wait_for_selector('#selected-date');date(b,'2026-10-12');expect(b.locator('.habit')).to_contain_text('已投 5 / 5 家')
            passed('独立浏览器会话同一账户读取服务端记录')
            nav(a,'项目与成果');nav(b,'项目与成果')
            def edit_title(page,title):
                page.get_by_role('button',name='编辑 / 子任务',exact=True).first.click();page.get_by_label('具体产出',exact=True).fill(title);submit(page)
            edit_title(a,'参数矩阵：设备A修改');saved(a)
            edit_title(b,'参数矩阵：设备B修改')
            expect(b.locator('#dialog h2')).to_have_text('多设备版本冲突 · 选择后保存',timeout=15000)
            b.locator('#dialog').get_by_label('保留哪一版',exact=True).select_option('local');submit(b,'合并并重试保存');saved(b)
            assert state(b)['state']['tasks'][0]['title']=='参数矩阵：设备B修改'
            passed('双会话并发冲突显示对比并显式选择保留版本')
            a.get_by_role('button',name='重试 / 检查同步').click();expect(a.locator('tbody tr').first).to_contain_text('设备B修改')
            nav(a,'今日安排');date(a,'2026-10-12');ca.set_offline(True)
            a.get_by_role('button',name='记录数量 / 耗时').click();a.get_by_label('备注',exact=True).fill('离线队列记录');submit(a)
            expect(a.locator('#sync')).to_contain_text('离线',timeout=10000)
            queued=a.evaluate("()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('worktable-v1-'))))")
            assert queued['pending'];assert queued['state']['habits'][1]['note']=='离线队列记录'
            a.evaluate('async()=>{await navigator.serviceWorker.ready}');a.reload();a.wait_for_selector('#selected-date');date(a,'2026-10-12');a.get_by_role('button',name='记录数量 / 耗时').click();expect(a.get_by_label('备注',exact=True)).to_have_value('离线队列记录');a.locator('#dialog').get_by_role('button',name='取消',exact=True).click();ca.set_offline(False);saved(a);assert state(a)['state']['habits'][1]['note']=='离线队列记录'
            passed('离线修改持久队列与恢复网络后同步')
            a.get_by_role('button',name='记录完成',exact=True).first.click();a.get_by_label('实际工时（分钟）',exact=True).fill('82');a.get_by_label('完成成果 / 备注',exact=True).fill('完成变量与对照组矩阵');submit(a);saved(a)
            ss=state(a)['state'];completed=next(x for x in ss['blocks'] if x.get('completedSnapshot'));assert completed['actualMinutes']==82;assert ss['tasks'][0]['status']=='todo'
            passed('时间块完成和实际投入独立于阶段完成，有历史计划快照')
            a.get_by_role('button',name='结束今日 / 复盘').click()
            reason=a.locator('select[name^="reason-"]').nth(1);reason.select_option('等待导师/设备');a.get_by_label('当日备注',exact=True).fill('等待导师回复，不自动把任务堆到明天')
            a.get_by_role('button',name='保存复盘',exact=True).click();saved(a)
            assert state(a)['state']['reviews'][0]['items'][1]['reason']=='等待导师/设备'
            a.get_by_role('button',name='生成未来调整预览',exact=True).click();submit(a,'生成对比预览');expect(a.locator('#dialog h2')).to_have_text('调整前后对比');a.locator('#dialog').get_by_role('button',name='取消此建议',exact=True).click();saved(a)
            passed('未完成原因、复盘、下一步建议保存，取消调整不修改正式计划')
            nav(a,'今日安排');date(a,'2026-10-15');sig=state(a)['state']['blocks']
            a.get_by_role('button',name='新增面试',exact=True).click();a.get_by_label('面试日期',exact=True).fill('2026-10-16');a.get_by_label('准备开始日',exact=True).fill('2026-10-15');a.get_by_label('准备必须完成于（不晚于面试日）',exact=True).fill('2026-10-16');submit(a,'生成对比预览')
            expect(a.locator('#dialog h2')).to_have_text('调整前后对比');saved(a);assert state(a)['state']['blocks']==sig
            submit(a,'全部接受');expect(a.locator('#dialog')).not_to_be_visible();saved(a)
            ss=state(a)['state'];assert sum(int(x['end'][:2])*60+int(x['end'][3:])-int(x['start'][:2])*60-int(x['start'][3:]) for x in ss['blocks'] if x['kind']=='prep')==240;assert any(x['kind']=='interview' for x in ss['events'])
            nav(a,'复盘');a.get_by_role('button',name='撤销',exact=True).click();saved(a);assert state(a)['state']['blocks']==sig
            passed('面试预览不变正式计划，4小时准备、独立面试、确认与撤销')
            nav(a,'设置与记录')
            with a.expect_download() as download: a.get_by_role('button',name='导出JSON备份',exact=True).click()
            backup=pathlib.Path(data)/'backup.json';download.value.save_as(backup);export=json.loads(backup.read_text());assert export['schemaVersion']==1
            before=state(a)
            a.get_by_role('button',name='导入恢复',exact=True).click();a.get_by_label('选择JSON备份',exact=True).set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"schemaVersion":99}'});submit(a,'校验并查看覆盖范围');expect(a.locator('#dialog-error')).to_contain_text('备份缺少');assert state(a)['revision']==before['revision'];a.locator('#dialog').get_by_role('button',name='取消',exact=True).click()
            a.get_by_role('button',name='导入恢复',exact=True).click();a.get_by_label('选择JSON备份',exact=True).set_input_files(backup);submit(a,'校验并查看覆盖范围');expect(a.locator('#dialog h2')).to_have_text('确认覆盖范围')
            with a.expect_download(): submit(a,'下载当前备份并恢复')
            saved(a);assert state(a)['state']['habits'][1]['note']=='离线队列记录'
            passed('JSON全量导出、结构验证、无效文件无损拒绝、导入前备份与恢复')
            nav(a,'周计划');a.get_by_role('button',name='第2周',exact=True).click();a.get_by_role('button',name='选择实验执行日',exact=True).click();a.locator('input[value="2026-10-20"]').check();submit(a,'预览执行日');submit(a,'全部接受');expect(a.locator('#dialog')).not_to_be_visible();saved(a)
            ss=state(a)['state'];assert any(x['kind']=='experiment' and x['date']=='2026-10-20' for x in ss['blocks']);assert not any(x['kind']=='experiment' and x['date'] in ['2026-10-20','2026-10-23'] for x in ss['reservations'])
            passed('实验选择器产生锁定操作块、释放同周未用预留并保留未确认依赖')
            nav(a,'今日安排');date(a,'2026-10-12');out=ROOT/'test-results';out.mkdir(exist_ok=True);a.screenshot(path=str(out/'today.png'),full_page=True)
            a.set_viewport_size({'width':390,'height':844});assert a.evaluate('document.documentElement.scrollWidth')<=390;a.screenshot(path=str(out/'mobile.png'),full_page=True)
            assert not errors,errors
            passed('桌面/窄屏截图与全流程零浏览器运行异常')
            (out/'browser-results.json').write_text(json.dumps({'passed':checks,'browserErrors':errors},ensure_ascii=False,indent=2))
            browser.close()
    finally:
        server.terminate();server.wait(timeout=10)
print(f'{len(checks)} browser checks passed')
