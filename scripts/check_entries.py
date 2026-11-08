import urllib.request, json, os

url = None
key = None
with open('frontend/.env') as f:
    for line in f:
        if line.startswith('VITE_SUPABASE_URL='):
            url = line.split('=', 1)[1].strip().strip('"').strip("'")
        if line.startswith('VITE_SUPABASE_ANON_KEY='):
            key = line.split('=', 1)[1].strip().strip('"').strip("'")

headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

# 1. Check latest versions
req = urllib.request.Request(f'{url}/rest/v1/timetable_versions?select=id,status,created_at&order=created_at.desc&limit=5', headers=headers)
with urllib.request.urlopen(req) as resp:
    versions = json.loads(resp.read().decode('utf-8'))
print('Recent versions:', versions)

if versions:
    latest_id = versions[0]['id']
    # 2. Check total entries count for this version
    h_count = dict(headers)
    h_count['Prefer'] = 'count=exact'
    h_count['Range'] = '0-0'
    req_c = urllib.request.Request(f'{url}/rest/v1/timetable_entries?version_id=eq.{latest_id}&select=id', headers=h_count)
    with urllib.request.urlopen(req_c) as resp:
        crange = resp.headers.get('Content-Range')
        print('Total entries in latest version (Content-Range):', crange)

    # 3. Check days of week in first 1000 rows
    req_d = urllib.request.Request(f'{url}/rest/v1/timetable_entries?version_id=eq.{latest_id}&select=time_slot_id,time_slots(day_of_week,period)&limit=1000', headers=headers)
    with urllib.request.urlopen(req_d) as resp:
        sample = json.loads(resp.read().decode('utf-8'))
        print('First page row count:', len(sample))
        days = set()
        for s in sample:
            ts = s.get('time_slots')
            if ts:
                days.add(ts['day_of_week'])
        print('Days in first page rows:', sorted(list(days)))

    # Now fetch rows 1000-2000
    h_page2 = dict(headers)
    h_page2['Range'] = '1000-1999'
    req_p2 = urllib.request.Request(f'{url}/rest/v1/timetable_entries?version_id=eq.{latest_id}&select=time_slot_id,time_slots(day_of_week,period)', headers=h_page2)
    with urllib.request.urlopen(req_p2) as resp:
        sample2 = json.loads(resp.read().decode('utf-8'))
        print('Rows returned in page 2 (1000-1999):', len(sample2))
        days2 = set()
        for s in sample2:
            ts = s.get('time_slots')
            if ts:
                days2.add(ts['day_of_week'])
        print('Days in page 2 rows:', sorted(list(days2)))
