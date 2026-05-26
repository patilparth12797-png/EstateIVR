db = db.getSiblingDB('shadowpbx');

db.createUser({
  user: 'shadowpbx',
  pwd: 'shadowpbx123',
  roles: [
    {
      role: 'readWrite',
      db: 'shadowpbx'
    }
  ]
});
