import { v1 }  from "uuid";

export const commanderSeeds = (knex) => {
  // Deletes ALL existing entries
  return knex("commander")
    .del()
    .then(() => {
      // Inserts seed entries
      return knex("commander").insert([
        {
          uuid: "v1()",
          name: "Aetheflead"
          description: "",
          thumbnail:
            "https://cdn.shopify.com/s/files/1/0258/1712/0802/products/aethelflaed_480x480.png?v=1565823184",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/aethefled-field-battle-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Scipio"
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero14.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/scipio-talent-tree.png",
        },
        {
          uuid: "v1()",
          name: "Hannibal"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/5/54/Hannibal_Barca.png/revision/latest?cb=20181107164847",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/hannibal-barca-field-battles-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Saladin"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/2/2d/Saladin.png/revision/latest?cb=20190217114036",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/saladin-talent-tree-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Constantine"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/bc/Constantine_I.png/revision/latest?cb=20190217114020",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/Constantine-1024x577.jpg",
        },
        {
          uuid: "v1()",
          name: "Lohar"
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero37.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/lohar-talent-tree-1024x578.png",
        },
        {
          uuid: "v1()",
          name: "Boudica"
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero17.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/BOUDICA_TALENTS_nukerlvl.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Osman"
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman_I_talents_all_in_one.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Osman"
          description: "",
          build: "Leadership"
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/osman-talent-2-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Osman"
          description: "",
          build: "City"
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/Osman.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/osman-talent-1-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "City Keeper"
          description: "THE MOST UNDERRATED SUPPORT COMMANDER",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/9/9d/City_Keeper.png/revision/latest?cb=20181107165426",
          build_url:
            "https://scontent.fhou1-1.fna.fbcdn.net/v/t1.0-9/71533422_791356961280814_2129001141004926976_o.jpg?_nc_cat=100&ccb=2&_nc_sid=cdbe9c&_nc_ohc=SqTDiqevAIIAX8DUZ1j&_nc_ht=scontent.fhou1-1.fna&oh=41b9c280a742c3349bf2cfe09938fe89&oe=6011501C",
        },
        {
          uuid: "v1()",
          name: "Dragon Lancer"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/c4/Dragon_Lancer.png/revision/latest?cb=20181107165413",
          build_url: "https://i.ytimg.com/vi/EgFujI7WiAM/hqdefault.jpg",
        },
        {
          uuid: "v1()",
          name: "Tomoe Gozen"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/8/87/Tomoe_Gozen.png/revision/latest?cb=20181107165303",
          build_url:
            "https://riseofkingdomsboss.com/wp-content/uploads/2020/01/rise-of-kingdoms-tomoe-gozen-versatility-build-728x331.jpg",
        },
        {
          uuid: "v1()",
          name: "Gengiskhan"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/e/e3/Genghis_Khan.png/revision/latest?cb=20190505172506",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/ghenghis-khan-talent-tree-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Cleopatra"
          description: "",
          thumbnail:
            "http://www.rocfanatics.com/wp-content/uploads/2018/10/rise-of-civilizations-cleopatra-2-372x700.jpg",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/cleopatra-support-build-1024x558.jpg",
        },
        {
          uuid: "v1()",
          name: "Joan of Arc"
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero15.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/joan-of-arc-support-build-1024x578.jpg",
        },
        {
          uuid: "v1()",
          name: "Sun Tzu"
          description: "",
          build: "skill"
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero3-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/SUN_TZU_TALENTS_NUKER-1.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Sun Tzu"
          description: "",
          build: "garrison"
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero3-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/SUN_TZU_TALENTS_GARRISON.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Sun Tzu"
          description: "",
          thumbnail:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero3-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/SUN_TZU_TALENTS_INFANTRI.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Julius Ceaser"
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/julius-talent-tree-2-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Julius Ceaser"
          description: "",
          build: "city"
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/julius-talent-tree-3-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Lancelot"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/cd/Lancelot.png/revision/latest?cb=20181107165242",
          build_url:
            "https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVWgqdWFa2x8&psig=AOvVaw37BmHx_7W6XPS8OOF7CpmX&ust=1584685792991000&source=images&cd=vfe&ved=0CAIQjRxqFwoTCPD1ieb0pegCFQAAAAAdAAAAABAI",
        },
        {
          uuid: "v1()",
          name: "Frederick"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/ba/Frederick_I.png/revision/latest?cb=20181107164601",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/uncle-fred-ultimate-build-1024x677.jpg",
        },
        {
          uuid: "v1()",
          name: "Frederick"
          build: "skill"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/ba/Frederick_I.png/revision/latest?cb=20181107164601",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/Fredrick-Field-Battle-tree-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "El Cid"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/a/a1/El_Cid.png/revision/latest?cb=20181107164512",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/el-cid-archer-build-1024x558.jpg",
        },
        {
          uuid: "v1()",
          name: "El Cid"
          description: "",
          build: "skill"
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/a/a1/El_Cid.png/revision/latest?cb=20181107164512",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/el-cid-skill-tree-1024x558.jpg",
        },
        {
          uuid: "v1()",
          name: "Mehmed"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/8/80/Mehmed_II.png/revision/latest?cb=20190217114048",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/mehmed-ii-pvp-buildings-build-1024x570.jpg",
        },
        {
          uuid: "v1()",
          name: "Belisarius"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/c2/Belisarius.png/revision/latest?cb=20190217114119",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/belisarius-talent-build-pve-1024x578.jpg",
        },
        {
          uuid: "v1()",
          name: "Belisarius"
          build: "cavalry"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/c/c2/Belisarius.png/revision/latest?cb=20190217114119",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/belisarius-talent-build-2-1024x578.jpg",
        },
        {
          uuid: "v1()",
          name: "Baibars"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/5/51/Baibars.png/revision/latest?cb=20190424194500",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/baibars-talent-tree-2-1024x578.jpg",
        },
        {
          uuid: "v1()",
          name: "Baibars"
          description: "",
          build: "cavalry"
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/5/51/Baibars.png/revision/latest?cb=20190424194500",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/baibars-cavalry-1024x576.jpg",
        },
        {
          uuid: "v1()",
          name: "Hermann"
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero12.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/HERMANN_TALENTS_GARRISON.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Hermann"
          description: "",
          build: "archer"
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero12.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/HERMANN_TALENTS_ARCHERY.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Hermann"
          description: "",
          build: "skill"
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero12.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/HERMANN_TALENTS_NUKER.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Eulji"
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero16.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/eulji-field-flad-fight-talent-tree-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Eulji"
          build: "garrison"
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero16.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/eulji-mundeok-garrison-talent-tree-1024x584.jpg",
        },
        {
          uuid: "v1()",
          name: "Charles Martel"
          description: "",
          build: "garrison"
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/2/22/Charles_Martel.png/revision/latest?cb=20181107164815",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/charles-martel-talent-2-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Charles Martel"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/2/22/Charles_Martel.png/revision/latest?cb=20181107164815",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/charles-martel-field-battle-talent-tree-1-1024x575.png",
        },
        {
          uuid: "v1()",
          name: "CaoCao"
          description: "",
          build: "cavalry"
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/b0/Cao_Cao.png/revision/latest?cb=20181107164543",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/cao-cao-field-fights-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "CaoCao"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/b/b0/Cao_Cao.png/revision/latest?cb=20181107164543",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/cao-cao-talent-tree-1024x576.jpg",
        },
        {
          uuid: "v1()",
          name: "ysg"
          description: "",
          thumbnail:
            "https://vignette.wikia.nocookie.net/riseofcivilizations/images/d/d0/Yi_Seong-Gye.png/revision/latest?cb=20181107164706",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/Yi_Seong-Gye-1024x576.jpg",
        },
        {
          uuid: "v1()",
          name: "Richard"
          description: "",
          build: "garrison"
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero8.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/richard-i-garrison-talent-1024x570.jpg",
        },
        {
          uuid: "v1()",
          name: "Richard"
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero8.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/09/richard-i-infantry-talent-1024x570.jpg",
        },
        {
          uuid: "v1()",
          name: "Kusunoki"
          description: "",
          build: "archer"
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero13.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/kusunoki-masashige-field-battle-1024x574.png",
        },
        {
          uuid: "v1()",
          name: "Kusunoki"
          description: "",
          build: "garrison"
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero13.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i0.wp.com/everythingrok.com/wp-content/uploads/2019/03/KUSUNOKI_TALENTS_GARRISON.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Kusunoki"
          description: "",
          thumbnail:
            "https://i2.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero13.png?fit=600%2C650&ssl=1",
          build_url:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/KUSUNOKI_TALENTS_NUKER.png?resize=1024%2C577&ssl=1",
        },
        {
          uuid: "v1()",
          name: "Pelagius"
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero18-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/pelagius-pvp-talent-tree-2-1024x578.jpg",
        },
        {
          uuid: "v1()",
          name: "Pelagius"
          build: "garrison"
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero18-1.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/03/pelagius-garrison-talent-tree-2-1024x578.jpg",
        },
        {
          uuid: "v1()",
          name: "Minamoto"
          description: "",
          thumbnail:
            "https://i1.wp.com/everythingrok.com/wp-content/uploads/2019/03/img_Hero9.png?fit=600%2C650&ssl=1",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/06/minamoto-no-yoshitsune-talent-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Alexander"
          description: "",
          thumbnail:
            "https://riseofkingdomsboss.com/wp-content/uploads/2019/04/Alexander_the_Great-162x300.png",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/11/alexander-field-battle-rally-talent-tree-1024x473.png",
        },
        {
          uuid: "v1()",
          name: "Edward"
          description: "",
          thumbnail:
            "https://rok.guide/wp-content/uploads/2019/08/edward-of-woodstock-1.jpg",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/07/edward-of-woodstock-skill-tree-2-1024x576.png",
        },
        {
          uuid: "v1()",
          name: "Edward"
          description: "",
          build: "skill"
          thumbnail:
            "https://rok.guide/wp-content/uploads/2019/08/edward-of-woodstock-1.jpg",
          build_url:
            "https://rok.guide/wp-content/uploads/2019/07/edward-of-woodstock-skill-tree-1-1024x576.png",
        },
      ]);
    });
};
