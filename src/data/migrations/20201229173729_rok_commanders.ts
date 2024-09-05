exports.up = (knex) => {
  return knex.schema.createTable("commander", (tbl) => {
    tbl.increments("id");
    tbl.string("uuid", 255).notNullable().unique();
    tbl.string("name", 50).notNullable();
    tbl.text("description");
    tbl.string("pairings", 255);
    tbl.string("build", 50);
    tbl.string("thumbnail", 255);
    tbl.string("build_url", 255);
    tbl.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = (knex) => {
  return knex.schema.dropTableIfExists("commander");
};
