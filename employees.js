// Employee list shown by the "Employee Info" button on staff.html.
// The records are NOT kept in this file any more (it is public): they are saved in the database under
// "aircon_employees", readable only by a Developer, Owner or Human Resources.
// ID numbers and statuses changed on the page are saved under "aircon_employees"
// (shared through the online database) and are used instead of this starting list.
const EMPLOYEES_KEY = "aircon_employees";
const EMPLOYEE_STATUSES = ["ACTIVE", "ON LEAVE", "SICK LEAVE", "INACTIVE"];
const EMPLOYEES = [];   // the list now lives only in the database (private: Developer, Owner and HR); see supabase/protect_private_data.sql
