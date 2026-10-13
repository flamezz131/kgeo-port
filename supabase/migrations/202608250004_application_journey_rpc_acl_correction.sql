-- K-GEO Application Journey RPC ACL correction.
-- Removes the unintended service_role EXECUTE privilege only.

begin;

revoke all on function
  public.get_counselor_university_application_journey(uuid)
  from service_role;

revoke all on function
  public.get_counselor_university_application_journey_history(uuid, integer)
  from service_role;

revoke all on function public.get_my_university_application_journeys()
  from service_role;

revoke all on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) from service_role;

commit;
