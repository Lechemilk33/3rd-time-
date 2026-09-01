# umbra

Two words. One solid. Turn it a quarter turn and it stops being the first
word and starts being the second.

    python3 -m umbra HELLO WORLD

It runs in your terminal. It needs Python 3.8 or newer and nothing else --
no packages to install, no network, no account, no key.

```
           %%     %% %%%%%%%%%  #         ##          #####
           ##     ** *********  *         **          *****
           ##     ** **         *         **        ##     ##
           ##     ** **         *         **        **     ++
           ##     ** **         *         **        **     ++
           **%%%%%** **%%%%#    *         **        **     ++
           ********* *******    *         **        **     ++
           **     ** **         *         **        **     ++
           **     ** **         *         **        **     ++
           **     ** **         *         **        **     ++
           **     ** **#######  *#######  **#######   #####
           **     ** *********  ********  *********   +++++
```

and a quarter turn later, the very same object:

```
           %%     %%   %%%%%    #######   ##        #######
           ##     **   *****    *******   **        *******
           ##     ** %%     %%  *      #  **        **     ##
           ##     ** **     **  *      *  **        **     ++
           ##     ** **     **  *      *  **        **     ++
           **     ** **     **  *######   **        **     ++
           **     ** **     **  *******   **        **     ++
           **  %  ** **     **  *  **     **        **     ++
           **  *  ** **     **  *  **     **        **     ++
           **%% %%** **     **  *    ##   **        **     ++
           ==     ==   #####    -      #  --####### --#####
           **     **   *****    *      *  ********* +++++++
```

Nothing was swapped out between those two pictures. It is one lump of
material, photographed twice, from two directions ninety degrees apart.

## What you're looking at

Take the word HELLO and push it through space like a cookie cutter, so it
becomes an endless prism with letters for a cross-section. Do the same to
WORLD, at right angles to the first. Now keep only the material that both
prisms claim, and throw the rest away.

What's left is one lump. Its outline head-on is HELLO. Its outline from the
side is WORLD. Not roughly, not nearly -- exactly, to the pixel, with nothing
fudged and nothing hidden round the back.

It turns on its own, resting a moment on each face. If you'd rather turn it
yourself:

    <- ->    turn it
    space    hold it still
    q        done

## What you can carve

A to Z, 0 to 9, and ` ! ? & # $ / \ @ `, and space. Lowercase gets shouted
at you. Quote anything with a space in it:

    python3 -m umbra "GOOD NIGHT" "SLEEP WELL"

The letters are drawn to a rule: no letter may have a gap running clean
across it. A height of the letter with no ink in it would be a height of the
sculpture with no material in it, and that empty slice would go missing from
*both* words at once. So the exclamation mark wears its dot on its sleeve and
the question mark's tail is joined on. They are being honest about the
conditions.

## Tests

    python3 -m unittest discover -s tests -t .

They read the picture back out of the terminal, colour code by colour code,
and insist that it spells the word.

## One last thing

The lump is usually not one lump.

The carve keeps every single scrap of material the two shadows permit -- and
there is nothing left to add, because any other scrap would light a pixel in
one of the shadows that the words never asked for. Even so, what you end up
holding is a few dozen chunks floating in mid-air with nothing between them.
HELLO and WORLD comes to ninety-seven separate pieces.

You could not build it out of wood. It stands up only because it is made of
light.

## Licence

MIT.
