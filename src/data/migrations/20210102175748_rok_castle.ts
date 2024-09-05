exports.up = (knex) => {
  return knex.schema.createTable("castle", (tbl) => {
    tbl.increments("id");
    tbl.string("uuid", 255).notNullable().unique();
    tbl.integer("level").notNullable();
    tbl.text("description");
    tbl.string("requirements", 50);
    tbl.string("rally", 50);
    tbl.string("cost", 50);
    tbl.string("time", 50);
    tbl.string("power", 50);
    tbl.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = (knex) => {
  return knex.schema.dropTableIfExists("castle");
};
