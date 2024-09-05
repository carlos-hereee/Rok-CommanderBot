const { v1 } = require("uuid");

exports.seed = (knex) => {
  // Deletes ALL existing entries
  return knex("commander")
    .del()
    .then(() => {
      // Inserts seed entries
      return knex("commander").insert([
        {
          uuid: v1(),
          name: "Aetheflead".toUpperCase(),
          description: "",
          thumbnail:
            "https://cdn.shopify.com/s/files/1/0258/1712/0802/products/aethelflaed_480x480.png?v=1565823184",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/aethefled-field-battle-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Scipio".toUpperCase(),
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero14.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/scipio-talent-tree.png",
        },
        {
          uuid: v1(),
          name: "Hannibal".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/5/54/Hannibal_Barca.png/revision/latest?cb=20181107164847",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/hannibal-barca-field-battles-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Saladin".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/2/2d/Saladin.png/revision/latest?cb=20190217114036",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/saladin-talent-tree-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Constantine".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/bc/Constantine_I.png/revision/latest?cb=20190217114020",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/Constantine-1024x577.jpg",
        },
        {
          uuid: v1(),
          name: "Lohar".toUpperCase(),
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero37.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/lohar-talent-tree-1024x578.png",
        },
        {
          uuid: v1(),
          name: "Boudica".toUpperCase(),
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero17.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/BOUDICA_TALENTS_nukerlvl.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Osman".toUpperCase(),
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman_I_talents_all_in_one.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Osman".toUpperCase(),
          description: "",
          build: "Leadership".toUpperCase(),
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/osman-talent-2-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Osman".toUpperCase(),
          description: "",
          build: "City".toUpperCase(),
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/osman-talent-1-1024x576.png",
        },
        {
          uuid: v1(),
          name: "City Keeper".toUpperCase(),
          description: "THE MOST UNDERRATED SUPPORT COMMANDER",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/9/9d/City_Keeper.png/revision/latest?cb=20181107165426",
          build_url:
            "https://scontent.fhou1-1.fna.fbcdn.net/v/t1.0-9/71533422_791356961280814_2129001141004926976_o.jpg?_nc_cat=100&ccb=2&_nc_sid=cdbe9c&_nc_ohc=SqTDiqevAIIAX8DUZ1j&_nc_ht=scontent.fhou1-1.fna&oh=41b9c280a742c3349bf2cfe09938fe89&oe=6011501C",
        },
        {
          uuid: v1(),
          name: "Dragon Lancer".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/c4/Dragon_Lancer.png/revision/latest?cb=20181107165413",
          build_url: "https://i.ytimg.com/vi/EgFujI7WiAM/hqdefault.jpg",
        },
        {
          uuid: v1(),
          name: "Tomoe Gozen".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/8/87/Tomoe_Gozen.png/revision/latest?cb=20181107165303",
          build_url:
            "https://riseofkingdomsboss.com/wp-content/uploads/2020/01/rise-of-kingdoms-tomoe-gozen-versatility-build-728x331.jpg",
        },
        {
          uuid: v1(),
          name: "Gengiskhan".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/e/e3/Genghis_Khan.png/revision/latest?cb=20190505172506",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/ghenghis-khan-talent-tree-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Cleopatra".toUpperCase(),
          description: "",
          thumbnail:
            "http://www.rocfanatics.com/wp-content/uploads/2018/10/rise-of-civilizations-cleopatra-2-372x700.jpg",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/cleopatra-support-build-1024x558.jpg",
        },
        {
          uuid: v1(),
          name: "Joan of Arc".toUpperCase(),
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero15.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/joan-of-arc-support-build-1024x578.jpg",
        },
        {
          uuid: v1(),
          name: "Sun Tzu".toUpperCase(),
          description: "",
          build: "skill".toUpperCase(),
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero3-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/SUN_TZU_TALENTS_NUKER-1.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Sun Tzu".toUpperCase(),
          description: "",
          build: "garrison".toUpperCase(),
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero3-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/SUN_TZU_TALENTS_GARRISON.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Sun Tzu".toUpperCase(),
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero3-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/SUN_TZU_TALENTS_INFANTRI.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Julius Ceaser".toUpperCase(),
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/julius-talent-tree-2-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Julius Ceaser".toUpperCase(),
          description: "",
          build: "city".toUpperCase(),
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/julius-talent-tree-3-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Lancelot".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/cd/Lancelot.png/revision/latest?cb=20181107165242",
          build_url:
            "https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVWgqdWFa2x8&psig=AOvVaw37BmHx_7W6XPS8OOF7CpmX&ust=1584685792991000&source=images&cd=vfe&ved=0CAIQjRxqFwoTCPD1ieb0pegCFQAAAAAdAAAAABAI",
        },
        {
          uuid: v1(),
          name: "Frederick".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/ba/Frederick_I.png/revision/latest?cb=20181107164601",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/uncle-fred-ultimate-build-1024x677.jpg",
        },
        {
          uuid: v1(),
          name: "Frederick".toUpperCase(),
          build: "skill".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/ba/Frederick_I.png/revision/latest?cb=20181107164601",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/Fredrick-Field-Battle-tree-1024x576.png",
        },
        {
          uuid: v1(),
          name: "El Cid".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/a/a1/El_Cid.png/revision/latest?cb=20181107164512",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/el-cid-archer-build-1024x558.jpg",
        },
        {
          uuid: v1(),
          name: "El Cid".toUpperCase(),
          description: "",
          build: "skill".toUpperCase(),
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/a/a1/El_Cid.png/revision/latest?cb=20181107164512",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/el-cid-skill-tree-1024x558.jpg",
        },
        {
          uuid: v1(),
          name: "Mehmed".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/8/80/Mehmed_II.png/revision/latest?cb=20190217114048",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/mehmed-ii-pvp-buildings-build-1024x570.jpg",
        },
        {
          uuid: v1(),
          name: "Belisarius".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/c2/Belisarius.png/revision/latest?cb=20190217114119",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/belisarius-talent-build-pve-1024x578.jpg",
        },
        {
          uuid: v1(),
          name: "Belisarius".toUpperCase(),
          build: "cavalry".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/c2/Belisarius.png/revision/latest?cb=20190217114119",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/belisarius-talent-build-2-1024x578.jpg",
        },
        {
          uuid: v1(),
          name: "Baibars".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/5/51/Baibars.png/revision/latest?cb=20190424194500",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/baibars-talent-tree-2-1024x578.jpg",
        },
        {
          uuid: v1(),
          name: "Baibars".toUpperCase(),
          description: "",
          build: "cavalry".toUpperCase(),
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/5/51/Baibars.png/revision/latest?cb=20190424194500",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/baibars-cavalry-1024x576.jpg",
        },
        {
          uuid: v1(),
          name: "Hermann".toUpperCase(),
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero12.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/HERMANN_TALENTS_GARRISON.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Hermann".toUpperCase(),
          description: "",
          build: "archer".toUpperCase(),
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero12.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/HERMANN_TALENTS_ARCHERY.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Hermann".toUpperCase(),
          description: "",
          build: "skill".toUpperCase(),
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero12.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/HERMANN_TALENTS_NUKER.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Eulji".toUpperCase(),
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero16.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/eulji-field-flad-fight-talent-tree-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Eulji".toUpperCase(),
          build: "garrison".toUpperCase(),
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero16.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/eulji-mundeok-garrison-talent-tree-1024x584.jpg",
        },
        {
          uuid: v1(),
          name: "Charles Martel".toUpperCase(),
          description: "",
          build: "garrison".toUpperCase(),
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/2/22/Charles_Martel.png/revision/latest?cb=20181107164815",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/charles-martel-talent-2-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Charles Martel".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/2/22/Charles_Martel.png/revision/latest?cb=20181107164815",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/charles-martel-field-battle-talent-tree-1-1024x575.png",
        },
        {
          uuid: v1(),
          name: "CaoCao".toUpperCase(),
          description: "",
          build: "cavalry".toUpperCase(),
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/b0/Cao_Cao.png/revision/latest?cb=20181107164543",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/cao-cao-field-fights-1024x576.png",
        },
        {
          uuid: v1(),
          name: "CaoCao".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/b0/Cao_Cao.png/revision/latest?cb=20181107164543",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/cao-cao-talent-tree-1024x576.jpg",
        },
        {
          uuid: v1(),
          name: "ysg".toUpperCase(),
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/d/d0/Yi_Seong-Gye.png/revision/latest?cb=20181107164706",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/Yi_Seong-Gye-1024x576.jpg",
        },
        {
          uuid: v1(),
          name: "Richard".toUpperCase(),
          description: "",
          build: "garrison".toUpperCase(),
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero8.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/richard-i-garrison-talent-1024x570.jpg",
        },
        {
          uuid: v1(),
          name: "Richard".toUpperCase(),
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero8.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/richard-i-infantry-talent-1024x570.jpg",
        },
        {
          uuid: v1(),
          name: "Kusunoki".toUpperCase(),
          description: "",
          build: "archer".toUpperCase(),
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero13.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/kusunoki-masashige-field-battle-1024x574.png",
        },
        {
          uuid: v1(),
          name: "Kusunoki".toUpperCase(),
          description: "",
          build: "garrison".toUpperCase(),
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero13.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/KUSUNOKI_TALENTS_GARRISON.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Kusunoki".toUpperCase(),
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero13.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/KUSUNOKI_TALENTS_NUKER.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: v1(),
          name: "Pelagius".toUpperCase(),
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero18-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/pelagius-pvp-talent-tree-2-1024x578.jpg",
        },
        {
          uuid: v1(),
          name: "Pelagius".toUpperCase(),
          build: "garrison".toUpperCase(),
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero18-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/pelagius-garrison-talent-tree-2-1024x578.jpg",
        },
        {
          uuid: v1(),
          name: "Minamoto".toUpperCase(),
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero9.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/minamoto-no-yoshitsune-talent-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Alexander".toUpperCase(),
          description: "",
          thumbnail:
            "https://riseofkingdomsboss.com/wp-content/uploads/2019/04/Alexander_the_Great-162x300.png",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/alexander-field-battle-rally-talent-tree-1024x473.png",
        },
        {
          uuid: v1(),
          name: "Edward".toUpperCase(),
          description: "",
          thumbnail:
            "https://rok.guide/wp-content/uploads/2019/08/edward-of-woodstock-1.jpg",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/07/edward-of-woodstock-skill-tree-2-1024x576.png",
        },
        {
          uuid: v1(),
          name: "Edward".toUpperCase(),
          description: "",
          build: "skill".toUpperCase(),
          thumbnail:
            "https://rok.guide/wp-content/uploads/2019/08/edward-of-woodstock-1.jpg",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/07/edward-of-woodstock-skill-tree-1-1024x576.png",
        },
      ]);
    });
};
