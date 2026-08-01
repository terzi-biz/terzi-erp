delete from crm_tasks where external_key = 'binotel:missed:TEST-1001';
delete from crm_calls where external_id = 'TEST-1001';
delete from crm_lead_activities where lead_id in (select id from crm_leads where external_source='binotel' and external_id='TEST-1001');
delete from crm_leads where external_source='binotel' and external_id='TEST-1001';
delete from crm_contacts where external_source='binotel' and external_id='TEST-1001';
delete from binotel_call_sessions where general_call_id = 'TEST-1001';