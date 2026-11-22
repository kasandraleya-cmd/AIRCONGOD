// TEAM INCENTIVE: the installation teams and each member's share (from the organization chart).
//
// How it works (attendance.js → Attendance.teamIncentives, used by Payroll):
//   * Each day, a team's DONE UNITS on the Daily Schedule are counted, PER UNIT not per client (each row's
//     QTY; 1 client with 2 units = 2 units) in INSTALLER blocks
//     where any team member is on the crew; SERVICE blocks don't count).
//   * The 1st unit is covered by the daily rate. When the team reaches its 2nd DONE unit that day
//     (startAtBatch, the name is kept for saved settings), the team earns its incentive (Team 1 = ₱1,050):
//     every member present gets their share.
//   * Absent = a team member who isn't on the crew that day. The absent member gets nothing, and their
//     share is NOT given to anyone: every member present gets only their OWN share.
//   * onePerDay: true  → the incentive is paid once per day (a 3rd or 4th unit adds nothing more)
//                false → paid again for every unit from the 2nd onward
//
// THE TEAMS NOW LIVE IN THE ONLINE DATABASE (key "aircon_teams"): change them on the Payroll page →
// "Teams & incentive". This list is only the STARTING list, used until the teams are saved there once.
// (name = full name on the Staff page; also = other names the person is written as in the crew box.)
window.INCENTIVE_TEAMS = {
  startAtBatch: 2,
  onePerDay: true,
  teams: [
    {
      team: "Team 1",
      members: [
        { name: "Ronnie Tuzon", also: ["RONNIE"], role: "Head Installer", share: 400 },
        { name: "George Dimafilis", also: ["GEORGE"], role: "Senior Installer", share: 300 },
        { name: "John Christoper Andor", also: ["ANDOR", "John Christopher Andor"], role: "Assistant Installer / Helper", share: 200 },
        { name: "Eduardo Esteloño", also: ["NINONG BOY", "Eduardo Estoloño", "Eduardo Estolonio"], role: "Driver", share: 150 },
      ],
    },
    {
      team: "Team 2",
      members: [
        { name: "Joshua Camaya", also: ["TUTOY"], role: "Head Installer", share: 400 },
        { name: "Albert Acayin", also: ["ALBERT"], role: "Senior Installer", share: 300 },
        { name: "Michael Borilla", also: ["MICHAEL"], role: "Assistant Installer", share: 200 },
        { name: "Joseph Segayo", also: ["JOSEPH"], role: "Assistant Installer", share: 200 },
      ],
    },
    {
      team: "Team 3",
      members: [
        { name: "Joshua Borja", also: ["BORJA"], role: "Head Installer", share: 350 },
        { name: "Ian Paulo Dominguez", also: ["IAN", "Ian Dominguez"], role: "Senior Installer", share: 300 },
        { name: "Jan Clei Lian Ofiaza", also: ["JAN CLEI", "Jan Clei Ofiaza"], role: "Junior Installer", share: 300 },
        { name: "Raymart Bracamonte", also: ["JOKER", "Raymart Bracks"], role: "Driver", share: 200 },
      ],
    },
  ],
};
