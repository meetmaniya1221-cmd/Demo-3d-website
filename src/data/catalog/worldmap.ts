/**
 * World map outline + observing-site presets for the night-sky location
 * picker - GENERATED DATA, do not hand-edit.
 *
 * Coastlines: Natural Earth 1:110m land polygons (public domain) via the
 * world-atlas TopoJSON build, simplified to ~0.3 deg and quantised to
 * 0.05 deg - detail enough for a 520 x 260 px picker, not for navigation.
 * City coordinates: GeoNames (CC BY 4.0), matched by name + country code.
 */

function dec36(s: string, at: number, w: number): number {
  return parseInt(s.slice(at, at + w), 36);
}

const LAND_BLOB =
  '1ux05j1ul0501s60521r605f1tm05c1uc05r1ux05j;0bk05u0ah05r09206c09e06k0af06g0bk05u;22x06n23m06e23x05j1zy04z1xx0571y005g1zo05s20z06n22x06n;0wo0960y20960x708u0vw0930w009a0wo096;0u90960v308z0ta0970u9096;1900a11a80a11ak09q18009q1750a21900a1;1pz0al1ps09x1oi09q1ns09q1o209y1ms09t1mc0a71nz0ag1o50be1oz0bq1pz0al;00002y00j03901j03302903a03403105l03e0780310c702l0ds02q0hh02g0ki02r0km0310gn0360eo03i0f70470f304f0cv04y0gb04t0io05d0ih05l0gx05x0dp0630c706n0c107a0ct0720el0770f206y0fx0700iu07i0im07x0is0840ji0880ju0810ow08q0xi08m10p09211m08i12708o14908815r08d18308618e08f17r08s17108u16e09o18x09i1ah0941dy09a1ef09p1go0961ir08z1je09d1lo08x1pp09g1qp09z1px0ba1qg0bx1qd0cl1qn0cu1t00e31vw0ev1w80ep1w00ej1tk0e01t70dm1ti0d81sl0d21rj0c91sw0bj1to0aq1ua09d1u70921s90871os07f1l307e1n306q1kq06g1kn0601m505f1uu0481vo03s20d04l24804e25d04t2c505d2bi05z28705v28406h28d06m2by07f2fj07q2ia0892ja08m2jg08u2iv08z2jf09d2l609s2ma0af2nw0a62o70al2pl0ab2rn0af2rv0a72wb0b62xa0b42y00an2zg0b530f0aw32p0b633x0b334j0aq3720av39s0bb3at0by3dh0b83fb0bw3id0ce3ks0d73mb0dg3nb0dc3on0cm3q50c93rl0ck3ua0c93up0bj3un0ba3to0ay3tr0aq3ud0aq3tr0a33ut09v3vg09y3x10b63z50bf3zy0c14200co4470cp44w0d845t0cp4980ck4be0cn4d50dl4f00ct4h90cy4j40de4k80cy4ml0cn4og0d24rk0cx4uv0d84v10dq4vw0cw4wd0ct50u0cu51h0ca52p0c054q0br55q0bx5740bg58g0bc59r0as5cy0an5f40a65e20935ca08o5av07n5au0775bj06k5ck06i5cs06959v06158s0515ay0485du03p5e403f5k002y5k0000000000;1qd0k31rv0jm1rm0jc1qt0ji1q50j41pj0j61nv0jq1mj0kn1oi0jz1oz0kl1ph0ku1pv0kr1qd0k3;1vh0lm1vx0ld1vr0l61v00l01ur0l71ua0ky1u00l71vh0lm;3v20me3u70md3ub0n03v70mr3v20me;50s0rc51b0r552e0rb5260q051z0q551l0pr5150pt50e0r550f0re50s0rc;5g40ra5g90r15gn0r95gt0r15fy0px5g60pn5f90pf5es0oi5e30o35cm0oc5ct0oy5eq0q35fm0r95g00ri5g40ra;5h00tx5hf0tc5hf0tp5hr0t55i70sy5j60t25iv0s95ig0s95hs0r25hd0qu5h10r25hd0rj5h60ru5gk0s25gz0sg5h20t85fx0ut5gv0uf5h00tx;5cu11p5cn11k5bx11y5b512u5cu11p;3jt16h3k015a3jw1543jp15g3jl15a3jo14n3i61053h80zs3gh1043g111r3go12v3gf14c3gp1503hq1583ii15w3il16f3iu16c3jc17b3jt16h;4zr16d4zy15x50b16550r15o51c13h52p12o53611l53r11k53u10z54x0zz5530zj5520yv55b0ye5520wu53j0u753c0t752e0t051a0sb50i0so50l0sy4zs0sg4y50sw4xk0tx4wq0u84wx0uh4ws0uw4wi0ui4w10uf4wm0vb4wk0vq4vk0um4v40uu4ul0vw4sz0wi4q30w44p00vp4op0v64mm0v44ll0uj4ks0uj4jx0v04jx0vc4ka0vj4ka0wg4iz0zi4j80z94j10zs4jh0ze4j010g4jf11x4jg11i4jp11v4ku12i4n51324nx13w4ny14f4oc14w4ol14f4ot14j4om14s4os1524p114x4p415d4pu1634ql16c4rb15r4s015p4rw1604sk1714to17a4tn17k4t817r4tj17t4v61774vu17f4w31754vj16m4va15o4xw1464y914d4yq15n4ym16e4yz17v4z61834zc17t4zr16d;4n218b4m318p4mm18t4n218b;4p518d4ol18b4ow18u4pi1974qr19c4pi18s4p518d;4li19i4m71964kv18z4li19i;4oa19i4o71974mm1944mm19b4n219f4nf1994oa19i;4gc1a84hf1a64hj1af4ka19d4jn1954g619p4ej1a74ex1aq4fl1ap4gc1a8;56m1a85671ad55u1b556o1ad56m1a8;54g1ay53h1ai52e1at52g1az5391ay53f1b853h1ax53s1az5491bd5471bp54n1bm54g1ay;4sh1ca4sp1bv4r21c44r71cf4sh1ca;5531bi54x1bd54o1bw53p1ch53v1cm54l1c75531bi;4uj1dd4uo1ch4v91c54vq1cq4wv1d250c1bv5141az5211am5261ac51n1aa51s19w52n18y52y18z52x18q53s18a53q18452618d51519j50f19r4zm19f4zo1904z918t4yd18y4xv19e4xb19i4wg19c4x119y4wn1b04u91c14tw1bq4tr1c64tc1cg4ua1cs4th1cs4si1dh4tk1dt4uj1dd;4pl1es4p51e94oq1e54ms1e54mp1dq4n71d84oj1do4oh1de4o81dh4ni1cy4o11c84of1b14o51av4nx1b24o61bj4nn1bb4ni1bh4nk1bo4n61c04n71cj4mu1cd4mx1ax4mb1b04me1c24m61c24lz1cg4mp1eb4n61eq4ob1ei4pl1es;4ri1en4rh1e54r61e74r61di4qs1ek4qw1f04r31f74ri1en;4es1ar4e61ar4d01bo4b51e44as1f048y1h24a61gx4bx1f64ch1f64dp1e24dh1dm4dz1de4ea1cp4eo1cn4ey1cb4es1ar;4lh1f14m41ei4lg1eg4la1dk4kr1d64kj1bs4kg1bz4jt1bq4jl1c24ix1ca4i91c24i21cc4h81cd4h51d44gm1dr4gl1er4gx1f44hr1f14hv1fi4is1fq4kv1hu4l31hv4le1hc4m81h04l61ft4ll1fa4lh1f1;4q81io4qb1i04q41hh4px1i24pn1hs4pu1hd4po1h44p01hf4ov1hu4p11i34oo1id4nu1hu4nq1i04ny1ih4om1iu4ot1il4pp1j04po1jf4q41j64q81io;4141hg40n1hb40d1hr40a1ik40j1jg41g1i64141hg;4ow1jq4oc1j04o01je4ob1k24om1k34oj1jp4oy1k94ow1jq;4lu1j64l41in4me1kb4mi1jv4lu1j6;4pq1kr4pw1k54pg1ka4pm1jr4pc1jn4p21ke4pe1kc4pe1kk4p11kz4pq1kr;4ne1oa4nx1oa4o21ni4nl1mv4nn1lz4ov1lo4oy1kz4ob1lj4o51lc4nt1lo4n11lp4n81m34n21m74mz1m04mp1mb4mm1n34mu1mx4n21oa4ne1oa;1rk1o51qo1nz1qn1o71rk1o5;1la1nx1kh1o51la1o81lo1ny1la1nx;1no1p11p51ox1q21oc1pu1o41or1o91oc1ns1nt1o41my1o11mp1od1nt1od1nk1ou1n81ox1no1p1;4hb1oe4gu1o44gd1oa4gd1or4hk1p64ho1oy4hb1oe;1jq1qn1jy1qg1kh1qi1lz1pj1ms1pa1kt1p11l61pc1kl1pj1ka1q01ik1qc1id1qg1ik1ql1gt1q61hg1qo1ib1qw1jq1qn;4nc1qo4n31q74mq1r34ni1s24nr1rw4nc1qo;4ut1wz4uk1wg4uc1wm4tw1w64tj1wc4tv1wx4ut1wz;3b81xt3ac1x739x1xi3b81xt;3561xu36m1xm35q1xe3521xm3561xu;30m1z930e1yc2yx1yw2yz1z730m1z9;2x420w2xg20i2xd1zs2ww1zm2wp1zr2wj20r2x420w;4yc1yn4xx1xj4w81x84vg1wl4v21wt4v21x84ss1wu4tc1wf4sz1vh4sm1v94sc1vg4sh1vy4rw1wi4to1xp4ve1xr4vy1yq4wc1yh4xh1z84xy20w4yj2104yu2084yu1zs4yb1z74yc1yn;2xb21f2x52102wr21h2x821w2xb21f;4zy22j50c22f50q22o50v22150121w4zk21c4yo21q4yd2144xr2134xo21n4xy2234yk2244yv23b4zy22j;1sn23v1tk23t1t323j1sd23s1s823z1sg2451sn23v;1to25a1s625p1t325m1to25a;0ve24y0u72550tf25o0sv25s0sp2670u525y0ve24y;1wt2661wg25o1wt25v1x725r1x025k1ya25d1y424y1yi2521yr24f1yj23x1xw2401xv24j1x82421ww2421xa24c1wr24h1v324g1v024m1vc24t1v324y1w52661wz26p1x826o1wt266;0qa2810qt2820qn27g0r42700q327o0q02830qa281;4zt26750d2584zk25e4z724l4zr2414zq23n4zb23z4yy23j4z026b4yo26v4yq27m4z827v4z02854z92874zt267;2o82712n926p2mg26s2mx27d2mm27y2nt28n2o928n2ov28b2ok27x2on27j2o8271;2z228w2yq28g2y22902yv2962z228w;0f029q0eg29j0e329x0f92a60fh2a00f029q;2qc2al2pr29z2qx2a22qa2932qu2922re28c2rr2892s927f2sy27b2sl26s2st26i2sb2672qd2662p325r2os25v2q426l2p826o2p326w2po2722pd27d2pg27q2qa27o2qd2802pz28c2pb28g2p72902ow28q2ov2992ol29k2p82al2qc2al;0802ba06z2bg07y2bi0802ba;1ii2cu1hv2cj1hc2cp1hr2cy1ii2cu;04l2dg06a2d605t2d004p2d604l2dg;1gp2eh1gs2e81h32eb1ji2df1j02d81hu2dm1gi2d11gb2dd1fk2db1g12dl1ga2ej1gp2eh;2jy2ex2jt2ek2kg2e72jq2dr2hn2da2fd2dj2fw2ds2ep2e22fo2e62fn2ec2eh2eg2ev2et2fp2ew2gk2ej2hf2eu2i42eo2j12ez2jy2ex;1lv2fb1l82fa1l32fk1lc2fv1lu2fy1ma2fs1m82fh1lv2fb;0002gb02t2fc02s2f00352ev0312f904j2f605m2eo0452ed0452dt03x2dp0282e20242eb00x2ec00m2ej00q2eq0022el00b2ec0002e4;5k02e45ik2dw5jn2d05jl2cm5ij2cq5gi2c95en2ba5du2bn5ce2b85c52bf5bm2b75av2b95a02ad5a12a55ao2a05al2975a329659u28q5a228h59328758w27k58327f57x26v57426c56d28s56m29j5742a557z2a95ax2bz5bd2cr5ap2cp5ad2c958y2bn58i2cb5722c555o2b75652av5412ao5432b25382b552j2av4z02at4v328f4vy28c4w82804wr27v4x42854xq2844yj27i4yk2714y426h4xt24x4ws23q4ux2244u721s4ti2224s721b4s220q4qv2034qs1zs4rb1zg4rx1yg4rq1xi4qa1x44q21yf4qh1yi4q41yz4pm1yx4pa1z64pm1zz4p12074n91zm4nv20g4nl20r4m41zt4ll1zs4lb1zj4ll1z54m21z24m21yt4mi1yn4n41z14nz1yt4o21yj4na1yd4m71xe4mt1x34nq1vm4nq1v74nd1v24nu1ul4nm1tp4nb1tn4lx1rn4ke1qo4jf1qc4j81qj4hk1pw4hd1pb4h21pa4h11pw4ga1q24eu1oz4ep1ol4gi1mi4gr1lh4go1kh4ef1is4e81j54ee1ji4di1jx4d01ks4c11l14c41lg4bm1lg4b41j54bh1j44bt1i54d71h34dx1eq4di1ep4cc1fj4bm1hl4aq1io4an1ic4av1kd49z1nf48z1mq48c1mx48f1o44811oz47b1ph46s1qn46a1qo4651q545h1q945e1q244c1py44d1pj4421p74391ou41o1ng41o1n740n1mu40d1jr4031jq3zu1jb4001j43zi1iz3z31if3yk1iy3xd1m43wv1mw3wd1pv3v51pm3uf1qa3up1qh3uj1qp3th1rb3sv1s43q61ry3nw1sb3nn1sz3ne1t33me1sq3km1th3ju1ur3io1uo3j41te3jv1su3k81rr3kc1sg3ko1sc3kk1rp3ks1rc3m01re3nb1so3nc1rv3nl1rh3on1r33p81qe3oi1pd3o51p93o21oj3mp1nt3mp1nl3l41n43kz1mo3j21ls3hd1le3h01l23g61l13fo1mg3fp1nc3er1ou3dr1pu3de1r63cu1ri3bj1tl3b91tl3be1ue3au1td3a01ul3ay1sj3bu1rb3br1qu3ch1q83cu1oc3dc1o03dt1mu3g21kw3fq1kj3gs1jt3ke1ko3kd1jx3jh1hs3ij1gc3ed1cl3ds1be3dj1aq3dk1ae3dx1a73ds19a3ei1813eo15u3ea1523cs1483bc1303ba12m3br11q3bp10m3a30zp3aa0zg3a10ya38p0wp37o0vt36c0v534j0v732w0uo3280v131z0vw3240wf30g0yy2zx11q2yk13z2yh14r2yy16h2zl17b2zm1812z618x2zd1992ym1b72ww1de2xg1fp2wq1gn2va1gd2uf1hh2ti1hh2qx1gm2pf1gv2nk1gf2kt1ic2kn1iy2jr1k22is1kr2iq1lk2i81m72iq1mo2iz1nj2iy1p62ij1po2j41r62kp1td2li1tn2mp1un2mk1vc2mu1w32o61wy2op1xv2qt1xj2st1yc2wo1yj2xa1yr2xo1yp2xo1ye2y61yi2xw1y82y31xu2y01xd2xn1x32xr1ws30h1vx30q1vg32m1ut3351v83301vn3371vx33z1w935z1vj3821v53981vj39r1v739w1vd3ar1v73b71vj3c01x93c31xw3bw1y63c31yd3ba1yg3ax1y43a21y239m1yd3901ye38i1y337z1ye37d1yd36m1z836w1zo36j1zx37620g38020h38920w39b20u3am21c3bj21d3db20r3ef20s3f32133f121p3ce2353d923p3cx23x3dq2493bf23p3bg23d3cb2393c72323au22n3aj22r3an2313a12373ao23h3ai23m39n23r39l23y39323w38h23138122y37v22a37e21o37m21438420y38020t37c20s36n20b36h20o35u20r35620m35k20a35a20734l20d34z1zs34r1zn35c1z835d1yx34u1z23501ys34o1yq34v1y834i1y83411yh33q1za32s20d32v21630w22630a2322zx2352zr22w2zl2332zr23c2zb23f2yv2382z022i30f21b30u21b30u21332a20b32620431d20h31520431j1zx31h1zm30y1z430q1z230y1zn30k2092yq2162xu21v2xo22e2wy22n2vn21z2uj2242tq21x2tp21a2sg20s2ru1zu2s21zj2qt1yd2pl1ye2p01xz2oe1yj2n21yh2n31z92mp1zj2n520n2ms21x2nk22b2qy2242r822g2rc23k2qd24f2pi24n2pg2522r42512qx25o2rg25f2sr25v2sx26b2u526o2um27i2vy27u2wi27r2ww2802wi28u2wi29f2wr29q2xw2a32xp29m2y229d2xd28t2xj28c2y32872y32802yy2892zu27v31s28h32x28933228h33t28o33q29k34029w34i2a334y29o35e29p35l2ag3512ak34z2aw37k2b23862bd37l2bm34p2b933u2bq33z2ca33p2cs33z2d43642e63622ef35a2eo34c2ei33s2e533v2ds31x2cv31i2c332g2be31x2ar31d2am30u2963052982zu28s2z728r2xr2b12wo2ae2vx2aa2v52ak2us2cf2xv2du3072fo32o2gs34s2h035n2hh37n2hk39e2h538o2h039a2gn39v2gu3ee2fr3et2fh3ev2f43e82et3dc2eo3ag2f13bc2em3bf2ds3ck2dh3cn2dr3ca2e03co2e73e02du3eh2dz3e32ee3fe2ey3gf2ep3gr2f33ga2ff3gk2fr3g52g33hp2fx3i02fm3hb2fj3hb2f83hr2f13im2f63ir2fi3lu2g93m92g83lq2fw3oo2ga3pb2fy3py2gb3pd2gm3pn2gt3ra2gn3u22fu3ug2g43tv2gj3t72gl3td2gv3t22hh3uv2il3wc2ig3wg2i43vx2ho3wg2h43wb2gc3wx2g03vm2eu3w82er3xp2fn3xd2fz3xn2gc3x12gd3ww2gp3xc2h93wm2hp3xm2i23xh2ih3y22i63xu2hn3yf2hj3y62hx3z42i54092i641a2hv40s2ic40q2ix4482j343s2jd44f2jq47t2k949q2k64bz2kh4co2ky4dz2l64ex2kz4e62kv4ff2kr4fl2ki4hq2km4jf2k54ja2jv4gs2j84is2j44j32ir4k72iz4og2ij4oh2iz4qk2iv4rg2il4rp2i84rd2i04sy2hc4th2hx4ud2ho4xp2hq4xb2i84y12ih5322i454z2hd58c2hd58t2h558q2gq59f2gl5d92go5e82g65ew2gc5eg2gp5ep2gy5hm2gu5k02gb;3ja20y3k020d3jj20c3j51zk3jc1yw3k91yh3lx1yj3ly1zn3li1zu3ln2083la2093le20q3lx20l3mf20r3lu21e3le2193lc20v3l621s3kj21z3jy22s3ki22q3ki2353lh2353lh2413kg2453ja23s3hy22s3ig2293ie21w3ja20y;1av2ge1aj2g718k2gk19g2gz1av2ge;0002hq01c2hl0002hd0002hq;1dp2gm1dp2g11eg2gh1f42g41ey2fp1fh2fc1gg2g81gi2gu1i42gp1iu2gf1iw2g51ih2fv1iv2fk1is2fa1hp2ew1gd2ez1fi2e01eu2dm1e22dl1dm2dc1dl2cz1cx2cx1c92cg1bn2bu1be2ar1c82ao1cq29q1di29u1gs28q1ib28n1id27m1is26z1jm26g1k126n1kc2771k22831jn28d1kj28n1lh29f1l22a91ke2ao1l12b91km2cm1mz2cp1od2bz1pc2bx1pi2ar1qf2ac1r82an1s42bj1tw29n1to29b1w528d1wd27w1x127l1x226z1un25x1r425x1py2591oi2401oz2441pv24u1rv25d1sd2531ru24p1s723p1sx23f1tu23i1ue2441uf23q1us23i1rp2271ra2281r922p1s82361qp2331qt22w1p222a1oq21x1on21j1p52151n220r1o120r1mx20n1ms2021me1zn1m11zy1mb1zc1lt1yo1ly1z31ll1zr1ll1z61l91z91lm1z21lx1xr1ll1xc1k31wm1it1vh1iu1up1jj1sy1jc1s01ix1s01im1sd1hz1ti1hx1u61ha1uq1gq1uh1g01uw1eg1uu1e81us1eg1ua1dx1u61d31ui1bv1ui1ac1tq19x1t81a11sd19n1qh1ai1oq1bj1o31cv1oe1dl1oq1du1po1fn1pz1fr1pl1fc1ox1f71o51ey1oa1ex1n71el1mu1gs1mw1ho1mh1hs1ly1hg1k61ic1j01ir1iw1jt1jc1lb1it1lz1j91m21jw1me1k61n81k91o51kx1oh1kq1od1kf1o11kc1o71jt1nz1jh1o61j11of1j31oj1jh1oc1k31p11kc1p51kr1q41jv1r71jx1ry1jm1sa1jx1tm1jy1t51js1tc1jj1u71j81ub1is1v61ig1vj1ht1w91hb1y11h71zi1gc1zy1f22091ez2091el1zu1e42001dy2101dv2101db21g1do2321d523c1ct2381ci23w1co25s1cf27c1bc2881b528p19x28h19026j16r26714325911t24o11923711121j1062120zm20u0y31y40uw1xh0ul1ws0un1vj0v61vi0uv1w80ue1w50u01wh0ts1wg0ti1vx0ss1v30si1td0sf1th0re1t50r71ru0r71rw0qn1sa0qh1sl0qn1sr0qd1rs0pu1rl0oz1qm0op1qg0oa1rj0nr1rc0n91qp0my1qc0mb1pl0lt1q50kx1pf0ky1on0km1ok0k31np0k91md0kz1m00mz1m80ni1mt0nx1lz0o31mi0ol1mp0pi1nb0pb1nm0qg1n80qm1n20px1mp0pz1nc0s71n40td1nd0te1ob0w01oa0xz1om0yn1p11311ox13t1ob14d1ls15v1jp1a01iv1al1j11au1is1bd1jp1cj1jk1cs1jd1ci1j11cr1j11df1ji1ef1k71es1kf1fh1kp1fi1l51g51ky1ga1ky1hq1kk1i61kk1im1jt1iz1ja1ii1jk1i71j21i01iz1ic1hm1ip1hj1j11gs1jm1gq1jb1gf1jj1ge1k61fb1l61fi1l81fe1le1eu1lb1db1lr1be1n01ad1mp16i1o615e1p31591pd15j1pw1531qn13b1s813a1sp11n1u31151vb10r1vj1081vo10b1ur1201st12j1ri1381qz12v1qo11o1rr11m1sg1031te10d1tf10l1tv0zu1uf0yu1wd0y61wx0x01x80uw20e0ut21r0v623a0uq24s0vm24p0vw2460vr2580u72600t72690sw26q0sz2730s927b0s627r0qp28u0qj29b0pt29s0pi2aa0o32ac0mb2b30k12bc0ia2bu0hn2bp0hs2bc0fq2av0fw2br0gh2bx0gc2c20eg2az0eu2ap0eb2ab0d629w0bz29408g2880ce29z0cr2aq0bn2ag0ax2at0a12al0a32b509q2bc0902b80852bm0852bx07q2c608l2d309f2d10ap2df0aa2ds0ao2e009l2dr08d2dt07k2dy06m2eh08n2f00932f00902eq0a62eq07d2fz07o2ga09d2gj0a22h30d02hn0e92ha0k82gz0o62ga0pc2gp0q52gm0rw2h00sa2gs0st2h60u52gm0uv2gz0uy2gk0wj2gs0zz2ga10q2g00zy2fq12x2fs13i2fg1442fq13k2fy13x2g51512g81612fs17n2fl19b2fo1992g019r2g41am2fx1al2fe1ay2fu1be2ft1bn2gd1af2gy1ag2hk1b42hy1ce2hm1d62h01co2gq1dp2gm;10l2im10b2id11j2ij12b2i912y2ij13g2id13w2ht1462i113s2im14u2im15g2id15z2hg17w2gx17u2go16x2gm17a2ge1732g71552gg1122g310r2gc0zi2gf0yt2gv11k2h30yi2h70y72he0zi2hm0xo2hr0yj2ie1002iq10l2im;15y2is15g2if14l2it15y2is;1ll2im1ln2ih1ju2if1j22ir1jd2iz1kn2ix1ll2im;1fx2in1gd2ib1gv2ir1ia2iz1j82ie1j52i11ks2if1mr2hv1mu2hn1nv2hr1qa2gy1qt2gg1ps2g61rz2fp1ss2f71tn2f51th2er1si2e41qy2ew1q82et1q52ei1rq2ds1s32d81rw2ct1ps2df1r92cf1ok2cy1nv2d81o22de1mf2dy1mg2ds1ku2dp1kd2dv1kq2ea1mx2ed1mq2ek1nn2fe1nh2fn1lb2ga1ln2gf1k52gz1iu2gr1eq2h41ea2hb1ev2hk1e22hk1dw2i51ew2iv1gb2j01fx2in;1892j119w2iz1a22it19j2ik1ad2ib1aa2ht18u2hn1722ia1722ih1872ie17l2ir1892j1;4zs2io4xp2ir4yx2j14zs2io;1c82if1bn2i01b02i11ao2it1bi2j71dq2j11c82if;0x32ho0vm2he0u12hx0v52iy0um2ja0yp2j80zu2it0xs2ia0x32hw0x32ho;53r2jq5342ji5162jr51b2jy53r2jq;1c02jo1bp2jg1a82jn1bb2k11c02jo;50m2jz5062jk4x72jg4w42jt4we2k74x52kb50m2jz;19a2km19p2kd19h2jo18k2jm17y2jp17z2k11722jz1712kf19a2km;13w2kc1442k51562k715a2jy14y2jo10t2jc10r2ji11w2jr0ym2js0zw2ki13f2jx12m2kh1342ko13p2km13w2kc;3nz2ha3lu2hb3lo2hk3ko2hp3kl2i03l62i53l52ig3m92ix3lq2iz3n22jh3mx2jq3ss2ko3tv2kr3u92kj3oi2ja3ms2i73mw2hr3nz2ha;1be2ku1d42ko1dl2kh1dh2k91eg2k01ix2k21jn2jm1ih2jd1f12jc1co2jl1ce2k61bu2ke1a22kn1a92kv1be2ku;0zg2l50zd2kq0yy2kj0wi2k60vr2ka0xu2l20zg2l5;12s2l611r2l010x2l71272lf12z2lc12s2l6;35q2l934i2l133j2l633w2lb33k2lh34q2ll35q2l9;1332lo11h2lk1222lt1332lo;1ar2ld19i2le1972lt1ax2lk1ar2ld;18f2lj18n2la15k2lk1642lq15g2lu15e2m21802ls18f2lj;4ee2li4b92la4c92m14cq2m34ej2lq4ee2li;3252ma33z2lv32l2ln3292l931s2l531i2ko30u2kn2zn2l03052l72y82lt2xt2m931g2mh3252ma;3652mo3782mh36f2m634s2m43362m731n2mm3652mo;3kf2mr3ig2mg3hu2ml3i52mr3gx2ms3iy2mq3jt2my3kf2mr;4bj2lu48r2lx46o2mn49b2n54bo2mc4bj2lu;1fo2m91gc2m31ej2li1dk2lg1ce2lj1bt2lr1c92m41b92m31aa2mj1bm2n01bd2n41co2n51f82mm1fo2m9;1py2o61sm2o21tm2nr1qf2na1rm2na1pf2ms1og2mc1la2m21m12m01lo2lw1m42ln1jp2kw1kq2ko1j92kc1ea2kh1e82kr1f92kw1ez2la1gs2l31f52lj1gq2m31fp2ml1ho2mi1ij2mp1fc2mq1d42ni1gi2nx1hs2nq1i82o11jy2o71py2o6;2cy2oe2gf2nz2ak2nk2e72ng2fa2nm2fr2nf2f52n32j92ni2kx2ne2l82n62gv2mk2i52mj2h22lr2h32l52hr2ks2fy2kl2gz2ka2h42jt2gj2jr2h92ja2g02j82gn2j02gh2it2ex2iq2fm2id2fm2i42ei2ic2e82i72fp2hp2fx2h92ex2h52dt2hp2e02hb2dd2h12fl2gz2cl2g12ac2fu2902f225w2ed25f2e12542da2482cu24g2ce23w2be2342bd22b2bt2172bt1zb2dd1yy2e81y72eq1ye2f51y12fc1yk2fz1ze2g71zr2gv1yb2gi1xm2go1xt2hc1zg2h71y02hr1wz2ht1xm2ic1w52ji1vg2jq1vg2jy1tz2ka1py2k91oc2ks1qx2l01na2ld1nd2ll1ri2m41rq2mb1q82mi1tf2n61t72nf1w82no1yj2ni2002nt23a2nd21y2no2212nx23w2o92cy2oe';

/** Land rings as flat [lon, lat, ...] degree arrays. */
export const LAND_RINGS: Float32Array[] = LAND_BLOB.split(';').map((ring) => {
  const n = ring.length / 6;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = dec36(ring, i * 6, 3) / 20 - 180;
    out[i * 2 + 1] = dec36(ring, i * 6 + 3, 3) / 20 - 90;
  }
  return out;
});

export interface CityPreset {
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  cc: string;
  lat: number;
  lon: number;
}

export const CITIES: CityPreset[] = [
  { name: "Addis Ababa", cc: 'ET', lat: 9.02, lon: 38.75 },
  { name: "Ahmedabad", cc: 'IN', lat: 23.03, lon: 72.59 },
  { name: "Amsterdam", cc: 'NL', lat: 52.37, lon: 4.89 },
  { name: "Anchorage", cc: 'US', lat: 61.22, lon: -149.9 },
  { name: "Athens", cc: 'GR', lat: 37.98, lon: 23.73 },
  { name: "Auckland", cc: 'NZ', lat: -36.85, lon: 174.76 },
  { name: "Bangkok", cc: 'TH', lat: 13.75, lon: 100.5 },
  { name: "Barcelona", cc: 'ES', lat: 41.39, lon: 2.16 },
  { name: "Beijing", cc: 'CN', lat: 39.91, lon: 116.4 },
  { name: "Bengaluru", cc: 'IN', lat: 12.97, lon: 77.59 },
  { name: "Berlin", cc: 'DE', lat: 52.52, lon: 13.41 },
  { name: "Bogota", cc: 'CO', lat: 4.61, lon: -74.08 },
  { name: "Brisbane", cc: 'AU', lat: -27.47, lon: 153.03 },
  { name: "Buenos Aires", cc: 'AR', lat: -34.61, lon: -58.38 },
  { name: "Cairo", cc: 'EG', lat: 30.06, lon: 31.25 },
  { name: "Cape Town", cc: 'ZA', lat: -33.93, lon: 18.42 },
  { name: "Casablanca", cc: 'MA', lat: 33.59, lon: -7.61 },
  { name: "Chennai", cc: 'IN', lat: 13.09, lon: 80.28 },
  { name: "Chicago", cc: 'US', lat: 41.85, lon: -87.65 },
  { name: "Colombo", cc: 'LK', lat: 6.94, lon: 79.85 },
  { name: "Copenhagen", cc: 'DK', lat: 55.68, lon: 12.57 },
  { name: "Delhi", cc: 'IN', lat: 28.65, lon: 77.23 },
  { name: "Denver", cc: 'US', lat: 39.74, lon: -104.98 },
  { name: "Dhaka", cc: 'BD', lat: 23.71, lon: 90.41 },
  { name: "Dubai", cc: 'AE', lat: 25.08, lon: 55.31 },
  { name: "Dublin", cc: 'IE', lat: 53.33, lon: -6.25 },
  { name: "Edinburgh", cc: 'GB', lat: 55.95, lon: -3.2 },
  { name: "Havana", cc: 'CU', lat: 23.13, lon: -82.38 },
  { name: "Helsinki", cc: 'FI', lat: 60.17, lon: 24.94 },
  { name: "Hong Kong", cc: 'HK', lat: 22.28, lon: 114.17 },
  { name: "Houston", cc: 'US', lat: 29.76, lon: -95.36 },
  { name: "Hyderabad", cc: 'IN', lat: 17.38, lon: 78.46 },
  { name: "Istanbul", cc: 'TR', lat: 41.01, lon: 28.95 },
  { name: "Jaipur", cc: 'IN', lat: 26.92, lon: 75.79 },
  { name: "Jakarta", cc: 'ID', lat: -6.21, lon: 106.85 },
  { name: "Johannesburg", cc: 'ZA', lat: -26.2, lon: 28.04 },
  { name: "Karachi", cc: 'PK', lat: 24.86, lon: 67.01 },
  { name: "Kathmandu", cc: 'NP', lat: 27.7, lon: 85.32 },
  { name: "Kolkata", cc: 'IN', lat: 22.56, lon: 88.36 },
  { name: "Kuala Lumpur", cc: 'MY', lat: 3.14, lon: 101.69 },
  { name: "Kyiv", cc: 'UA', lat: 50.45, lon: 30.52 },
  { name: "Lagos", cc: 'NG', lat: 6.45, lon: 3.39 },
  { name: "Lahore", cc: 'PK', lat: 31.56, lon: 74.35 },
  { name: "Lima", cc: 'PE', lat: -12.04, lon: -77.03 },
  { name: "London", cc: 'GB', lat: 51.51, lon: -0.13 },
  { name: "Los Angeles", cc: 'US', lat: 34.05, lon: -118.24 },
  { name: "Madrid", cc: 'ES', lat: 40.42, lon: -3.7 },
  { name: "Manila", cc: 'PH', lat: 14.6, lon: 120.98 },
  { name: "Melbourne", cc: 'AU', lat: -37.81, lon: 144.96 },
  { name: "Mexico City", cc: 'MX', lat: 19.43, lon: -99.13 },
  { name: "Miami", cc: 'US', lat: 25.77, lon: -80.19 },
  { name: "Montreal", cc: 'CA', lat: 45.51, lon: -73.59 },
  { name: "Moscow", cc: 'RU', lat: 55.75, lon: 37.62 },
  { name: "Mumbai", cc: 'IN', lat: 19.07, lon: 72.88 },
  { name: "Munich", cc: 'DE', lat: 48.14, lon: 11.58 },
  { name: "Nairobi", cc: 'KE', lat: -1.28, lon: 36.82 },
  { name: "New York", cc: 'US', lat: 40.71, lon: -74.01 },
  { name: "Nuuk", cc: 'GL', lat: 64.18, lon: -51.72 },
  { name: "Oslo", cc: 'NO', lat: 59.91, lon: 10.75 },
  { name: "Paris", cc: 'FR', lat: 48.85, lon: 2.35 },
  { name: "Perth", cc: 'AU', lat: -31.95, lon: 115.86 },
  { name: "Prague", cc: 'CZ', lat: 50.09, lon: 14.42 },
  { name: "Quito", cc: 'EC', lat: -0.23, lon: -78.52 },
  { name: "Reykjavik", cc: 'IS', lat: 64.14, lon: -21.9 },
  { name: "Rio de Janeiro", cc: 'BR', lat: -22.91, lon: -43.18 },
  { name: "Riyadh", cc: 'SA', lat: 24.69, lon: 46.72 },
  { name: "Rome", cc: 'IT', lat: 41.89, lon: 12.51 },
  { name: "Saint Petersburg", cc: 'RU', lat: 59.94, lon: 30.31 },
  { name: "San Francisco", cc: 'US', lat: 37.77, lon: -122.42 },
  { name: "Santiago", cc: 'CL', lat: -33.46, lon: -70.65 },
  { name: "Sao Paulo", cc: 'BR', lat: -23.55, lon: -46.64 },
  { name: "Seattle", cc: 'US', lat: 47.61, lon: -122.33 },
  { name: "Seoul", cc: 'KR', lat: 37.57, lon: 126.98 },
  { name: "Shanghai", cc: 'CN', lat: 31.22, lon: 121.46 },
  { name: "Singapore", cc: 'SG', lat: 1.29, lon: 103.85 },
  { name: "Stockholm", cc: 'SE', lat: 59.33, lon: 18.07 },
  { name: "Suva", cc: 'FJ', lat: -18.14, lon: 178.43 },
  { name: "Sydney", cc: 'AU', lat: -33.87, lon: 151.21 },
  { name: "Tehran", cc: 'IR', lat: 35.69, lon: 51.42 },
  { name: "Tokyo", cc: 'JP', lat: 35.69, lon: 139.69 },
  { name: "Toronto", cc: 'CA', lat: 43.71, lon: -79.4 },
  { name: "Tromso", cc: 'NO', lat: 69.65, lon: 18.96 },
  { name: "Ushuaia", cc: 'AR', lat: -54.81, lon: -68.32 },
  { name: "Vancouver", cc: 'CA', lat: 49.25, lon: -123.12 },
  { name: "Venice", cc: 'IT', lat: 45.44, lon: 12.33 },
  { name: "Vienna", cc: 'AT', lat: 48.21, lon: 16.37 },
  { name: "Warsaw", cc: 'PL', lat: 52.23, lon: 21.01 },
  { name: "Wellington", cc: 'NZ', lat: -41.29, lon: 174.78 },
  { name: "Zurich", cc: 'CH', lat: 47.37, lon: 8.55 },
];

const COUNTRY_NAMES: Record<string, string> = {
  AE: 'United Arab Emirates', AR: 'Argentina', AT: 'Austria', AU: 'Australia',
  BD: 'Bangladesh', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland', CL: 'Chile',
  CN: 'China', CO: 'Colombia', CU: 'Cuba', CZ: 'Czechia', DE: 'Germany',
  DK: 'Denmark', EC: 'Ecuador', EG: 'Egypt', ES: 'Spain', ET: 'Ethiopia',
  FI: 'Finland', FJ: 'Fiji', FR: 'France', GB: 'United Kingdom', GL: 'Greenland',
  GR: 'Greece', HK: 'Hong Kong', ID: 'Indonesia', IE: 'Ireland', IN: 'India',
  IR: 'Iran', IS: 'Iceland', IT: 'Italy', JP: 'Japan', KE: 'Kenya',
  KR: 'South Korea', LK: 'Sri Lanka', MA: 'Morocco', MX: 'Mexico', MY: 'Malaysia',
  NG: 'Nigeria', NL: 'Netherlands', NO: 'Norway', NP: 'Nepal', NZ: 'New Zealand',
  PE: 'Peru', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland', PT: 'Portugal',
  RU: 'Russia', SA: 'Saudi Arabia', SE: 'Sweden', SG: 'Singapore', TH: 'Thailand',
  TR: 'Turkey', UA: 'Ukraine', US: 'USA', VE: 'Venezuela', ZA: 'South Africa',
};

export function countryName(cc: string): string {
  return COUNTRY_NAMES[cc] ?? cc;
}
